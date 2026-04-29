import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { logClientError, logClientWarn } from '../utils/observability';

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

function readAuthStoreId(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const v = localStorage.getItem('auth_store');
    if (!v) return null;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function navigateToLoginFromClient(): void {
  try {
    if (typeof window === 'undefined') return;
    const { pathname, search, hash } = window.location;
    if (pathname.startsWith('/login') || pathname.startsWith('/admin/login')) return;

    const next = encodeURIComponent(`${pathname}${search}${hash}`);
    const target = `/login?next=${next}`;
    window.history.replaceState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  } catch (_) {
    // ignore navigation failures
  }
}

function hasClientAuthToken(): boolean {
  try {
    const fromStorage = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (fromStorage && fromStorage.trim().length > 0) return true;
  } catch {
    // ignore storage access failures
  }

  try {
    return Boolean(readCookie('auth_token_js'));
  } catch {
    return false;
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
    const isStorefrontRequest = config.url?.startsWith('/storefront/');

    // 1. Handle Admin Auth
    try {
      const adminToken = localStorage.getItem('auth_token');
      if (adminToken) {
        // If it's NOT a storefront request, admin token goes to Authorization
        if (!isStorefrontRequest) {
          config.headers.Authorization = `Bearer ${adminToken}`;
        }
        // Always send admin token in the custom header for context resolution
        config.headers['x-admin-token'] = adminToken;
      }
    } catch (err) {}

    // 2. Handle Storefront/Customer Auth
    if (isStorefrontRequest) {
      try {
        const customerToken = localStorage.getItem('customer_token');
        if (customerToken) {
          config.headers.Authorization = `Bearer ${customerToken}`;
        }
      } catch (err) {}
    }

    // 3. Handle Tenant Context
    try {
      const storeId = readAuthStoreId();
      if (storeId && !config.headers['x-store-id']) {
        config.headers['x-store-id'] = storeId;
      }
    } catch (_) {}
    
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
        logClientError({
          area: 'api-client',
          action: 'unexpected-html-response',
          message: 'Received HTML response for API request',
          context: {
            url: response.config?.url,
            method: response.config?.method,
            status: response.status,
          },
          error: e,
        });
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
      const requestPath = String(config.url || '').split('?')[0];
      const isAuthProbeRequest = requestPath === '/admin/auth/me' || requestPath.startsWith('/admin/auth/');
      const shouldForceLogout = isAuthProbeRequest || !hasClientAuthToken();

      if (!shouldForceLogout) {
        return Promise.reject(error);
      }

      try {
        try { localStorage.removeItem('auth_token'); } catch (_) { /* ignore */ }
        // Also attempt to clear cookie-based token so UI flows can retry cleanly
        try { if (typeof document !== 'undefined') document.cookie = 'auth_token=; Path=/; Max-Age=0;'; } catch (_) { /* ignore */ }
        try { if (typeof document !== 'undefined') document.cookie = 'auth_token_js=; Path=/; Max-Age=0;'; } catch (_) { /* ignore */ }

        navigateToLoginFromClient();
      } catch (err) {
        logClientWarn({
          area: 'api-client',
          action: 'handle-401-redirect',
          message: 'Failed handling 401 redirect flow',
          context: { requestPath },
          error: err,
        });
      }

      try {
        navigateToLoginFromClient();
      } catch (err) {
        logClientWarn({
          area: 'api-client',
          action: 'handle-401-redirect-fallback',
          message: 'Failed handling 401 redirect fallback',
          context: { requestPath },
          error: err,
        });
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
