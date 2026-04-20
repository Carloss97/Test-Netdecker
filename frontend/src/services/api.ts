import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';

let API_BASE_URL = (import.meta.env.VITE_API_URL as string) || '/api';

// Runtime preference: avoid cross-origin API calls from the browser.
// If VITE_API_URL points to a different origin than the current page,
// prefer the relative `/api` path so the frontend's host (Vercel) can
// proxy requests to the backend (via vercel.json rewrites) and avoid CORS.
try {
  if (typeof API_BASE_URL === 'string' && API_BASE_URL.startsWith('http')) {
    try {
      const parsed = new URL(API_BASE_URL);
      const loc = typeof window !== 'undefined' ? window.location : null;
      if (loc && parsed.origin !== loc.origin) {
        // Use same-origin proxy path to avoid CORS
        // (Vercel rewrite will forward /api/* to the backend)
        API_BASE_URL = '/api';
      } else {
        // same-origin: ensure the base ends with /api
        if (!API_BASE_URL.endsWith('/api')) API_BASE_URL = API_BASE_URL.replace(/\/+$/, '') + '/api';
      }
    } catch (e) {
      // If URL parsing fails, fall back to relative path to be safe
      API_BASE_URL = '/api';
    }
  } else {
    // Relative base: normalize trailing slashes and ensure /api prefix
    if (API_BASE_URL && API_BASE_URL !== '/api') API_BASE_URL = API_BASE_URL.replace(/\/+$/, '') + '/api';
  }
} catch (_) {
  API_BASE_URL = '/api';
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

// Ensure cookies are sent for cross-origin requests when needed
apiClient.defaults.withCredentials = true;

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Add token if available (use safe storage access; some browsers block storage)
    try {
      const token = localStorage.getItem('auth_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      // Storage may be blocked by Tracking Prevention or similar; continue without token
      // eslint-disable-next-line no-console
      console.warn('[api] localStorage access blocked in request interceptor', err);
    }
    
    // Fallback: try to extract auth_token from cookies when localStorage is unavailable
    try {
      if (!config.headers.Authorization && typeof document !== 'undefined' && document.cookie) {
        const match = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('auth_token='));
        if (match) {
          const cookieVal = decodeURIComponent(match.substring('auth_token='.length));
          if (cookieVal) config.headers.Authorization = `Bearer ${cookieVal}`;
        }
      }
    } catch (e) {
      // ignore cookie parsing errors
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
      try {
        try { localStorage.removeItem('auth_token'); } catch (_) { /* ignore */ }
        // Also attempt to clear cookie-based token so UI flows can retry cleanly
        try { if (typeof document !== 'undefined') document.cookie = 'auth_token=; Path=/; Max-Age=0;'; } catch (_) { /* ignore */ }
        const RELOAD_KEY = 'netdecker.auth_reload_ts';
        const COOLDOWN_MS = 60_000; // 1 minute
        const now = Date.now();
        let last = 0;
        try {
          last = Number(localStorage.getItem(RELOAD_KEY) || '0');
        } catch (e) {
          // storage blocked — treat as no previous reload
          // eslint-disable-next-line no-console
          console.warn('[api] localStorage.getItem blocked for reload guard', e);
          last = 0;
        }

        if (!last || now - last > COOLDOWN_MS) {
          try { localStorage.setItem(RELOAD_KEY, String(now)); } catch (e) { /* ignore */ }
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
        // Ensure we still attempt a reload if storage operations completely fail
        // eslint-disable-next-line no-console
        console.warn('[api] failed handling 401 reload guard', err);
        try { window.location.reload(); } catch { /* ignore */ }
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
