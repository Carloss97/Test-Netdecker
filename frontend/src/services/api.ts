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
  (response) => {
    // Defensive: if the server returned HTML (e.g. index.html) for an API
    // request, reject the response so callers handle it as an error instead
    // of trying to process HTML as JSON/arrays (which caused the runtime
    // TypeErrors like "x.map is not a function").
    try {
      const headers = response.headers as Record<string, string> | undefined;
      const ct = headers ? (headers['content-type'] || headers['Content-Type'] || '') : '';
      if (typeof response.data === 'string' && ct.includes('text/html')) {
        const e = new Error('Unexpected HTML response from API; check backend or _redirects rules');
        // attach the response for diagnostics
        (e as any).response = response;
        return Promise.reject(e);
      }
    } catch (_) {
      // ignore and continue
    }
    return response;
  },
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
      // Handle auth errors: clear token and trigger a single reload so
      // external auth (Cloudflare Access, etc.) can re-run its flow.
      // Guard with a sessionStorage flag to avoid infinite reload loops.
      localStorage.removeItem('auth_token');
      try {
        const RELOAD_KEY = 'netdecker.auth_reload_in_progress';
        if (!sessionStorage.getItem(RELOAD_KEY)) {
          sessionStorage.setItem(RELOAD_KEY, '1');
          // Reload once; clear the lock after a delay to allow future attempts
          window.location.reload();
          setTimeout(() => sessionStorage.removeItem(RELOAD_KEY), 10_000);
        }
      } catch (_) {
        // If storage fails for any reason, fall back to a plain reload.
        try { window.location.reload(); } catch { /* ignore */ }
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
