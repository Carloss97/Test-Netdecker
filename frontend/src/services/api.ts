import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const RETRYABLE_METHODS = new Set(['get', 'head', 'options']);
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 350;

type RetryableConfig = InternalAxiosRequestConfig & {
  _retryCount?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function shouldRetry(error: AxiosError): boolean {
  const method = error.config?.method?.toLowerCase();
  if (!method || !RETRYABLE_METHODS.has(method)) {
    return false;
  }

  // Retry transient startup/network/proxy errors.
  if (!error.response) {
    return true;
  }

  return error.response.status >= 500;
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Add token if available
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = (error.config || {}) as RetryableConfig;

    if (shouldRetry(error)) {
      const currentRetry = config._retryCount ?? 0;
      if (currentRetry < MAX_RETRIES) {
        config._retryCount = currentRetry + 1;
        const backoffMs = BASE_RETRY_DELAY_MS * Math.pow(2, currentRetry);
        await sleep(backoffMs);
        return apiClient.request(config);
      }
    }

    if (error.response?.status === 401) {
      // Handle auth errors: clear token and reload the page so Cloudflare Access
      // (or any external auth) can re-run its flow. Redirecting to `/login`
      // caused blank pages when no `/login` route exists.
      localStorage.removeItem('auth_token');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

export default apiClient;
