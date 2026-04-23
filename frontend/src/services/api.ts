import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';

let API_BASE_URL = (import.meta.env.VITE_API_URL as string) || '/api';

// By default prefer an explicit `VITE_API_URL` (cross-origin) so the browser
// talks directly to the backend host and can receive/send the httpOnly
// `auth_token` cookie. In some deployments you may want to force same-origin
// proxying via Vercel rewrites; set `VITE_API_FORCE_SAME_ORIGIN=1` to enable that.
const FORCE_SAME_ORIGIN = (import.meta.env.VITE_API_FORCE_SAME_ORIGIN === '1' || import.meta.env.VITE_API_FORCE_SAME_ORIGIN === 'true');

try {
  if (typeof API_BASE_URL === 'string' && API_BASE_URL.startsWith('http')) {
    try {
      const parsed = new URL(API_BASE_URL);
      const loc = typeof window !== 'undefined' ? window.location : null;
      if (loc && parsed.origin !== loc.origin) {
        if (FORCE_SAME_ORIGIN) {
          // Force same-origin proxy (useful for environments that rely on Vercel rewrites)
          API_BASE_URL = '/api';
        } else {
          // Use explicit external API origin so cross-origin cookies work
          if (!API_BASE_URL.endsWith('/api')) API_BASE_URL = API_BASE_URL.replace(/\/+$/, '') + '/api';
        }
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

function readCookie(name: string): string | null {
  try {
    if (typeof document === 'undefined' || !document.cookie) return null;
    const match = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
    if (!match) return null;
    return decodeURIComponent(match.substring(name.length + 1));
  } catch {
    return null;
  }
}

function hydrateAuthHeader(): void {
  try {
    const existing = apiClient.defaults.headers.common.Authorization;
    if (existing) return;
    const token = (() => {
      try {
        const stored = localStorage.getItem('auth_token');
        if (stored) return stored;
      } catch (_) {
        // ignore storage failures
      }
      return readCookie('auth_token_js');
    })();
    if (token) {
      apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
    }
  } catch (_) {
    // ignore hydration failures
  }
}

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const normalizedBase = API_BASE_URL.replace(/\/+$/, '');
  return `${normalizedBase}${normalizedPath}`;
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
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
hydrateAuthHeader();

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

    // Fallback: try to extract a JS-readable token from cookies when localStorage is unavailable
    try {
      if (!config.headers.Authorization && typeof document !== 'undefined' && document.cookie) {
        const cookieVal = readCookie('auth_token_js');
        if (cookieVal) config.headers.Authorization = `Bearer ${cookieVal}`;
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
