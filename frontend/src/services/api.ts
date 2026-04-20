import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';

let API_BASE_URL = (import.meta.env.VITE_API_URL as string) || '/api';

// Normalize VITE_API_URL to always point at the API prefix.
// If the deploy env provides a host like "https://api-erp.krumm.cl"
// ensure the runtime base becomes "https://api-erp.krumm.cl/api" so
// frontend callers don't accidentally request "/admin/..." instead
// of "/api/admin/...".
try {
  if (typeof API_BASE_URL === 'string' && API_BASE_URL.startsWith('http') && !API_BASE_URL.endsWith('/api')) {
    API_BASE_URL = API_BASE_URL.replace(/\/+$/, '') + '/api';
  }
} catch (_) {
  // fallback: leave as-is
}
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
      // Use a localStorage timestamp guard to avoid infinite reload loops
      // even across cross-origin redirects where sessionStorage might be
      // unreliable.
      localStorage.removeItem('auth_token');
      try {
        const RELOAD_KEY = 'netdecker.auth_reload_ts';
        const COOLDOWN_MS = 60_000; // 1 minute
        const now = Date.now();
        const last = Number(localStorage.getItem(RELOAD_KEY) || '0');
        if (!last || now - last > COOLDOWN_MS) {
          localStorage.setItem(RELOAD_KEY, String(now));
          // Log for diagnostics and perform a single reload to trigger
          // external auth flows.
          // eslint-disable-next-line no-console
          console.warn('[api] 401 received — reloading once to trigger auth flow');
          try { window.location.reload(); } catch (_) { /* ignore */ }
        } else {
          // eslint-disable-next-line no-console
          console.warn('[api] 401 received — reload suppressed by guard');
        }
      } catch (err) {
        // If storage fails for any reason, fall back to a plain reload.
        // eslint-disable-next-line no-console
        console.warn('[api] failed to access localStorage for reload guard', err);
        try { window.location.reload(); } catch { /* ignore */ }
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
