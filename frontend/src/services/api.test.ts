import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import apiClient, { buildApiUrl } from './api';

type RequestHandler = {
  fulfilled?: (config: any) => Promise<any> | any;
};

function getRequestInterceptor() {
  const handlers = (apiClient.interceptors.request as any).handlers as RequestHandler[];
  const handler = handlers.find((entry) => typeof entry?.fulfilled === 'function');
  if (!handler?.fulfilled) {
    throw new Error('Request interceptor not found');
  }
  return handler.fulfilled;
}

function getResponseInterceptor() {
  const handlers = (apiClient.interceptors.response as any).handlers as Array<{ fulfilled?: (value: any) => any; rejected?: (error: any) => any }>;
  const handler = handlers.find((entry) => typeof entry?.fulfilled === 'function');
  if (!handler?.fulfilled) {
    throw new Error('Response interceptor not found');
  }
  return handler.fulfilled;
}

function getResponseErrorInterceptor() {
  const handlers = (apiClient.interceptors.response as any).handlers as Array<{ fulfilled?: (value: any) => any; rejected?: (error: any) => any }>;
  const handler = handlers.find((entry) => typeof entry?.rejected === 'function');
  if (!handler?.rejected) {
    throw new Error('Response error interceptor not found');
  }
  return handler.rejected;
}

describe('api client auth propagation', () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = 'auth_token_js=; Max-Age=0; Path=/';
    delete (apiClient.defaults.headers.common as any).Authorization;
    delete (apiClient.defaults.headers.common as any)['x-admin-token'];
    delete (apiClient.defaults.headers.common as any)['x-store-id'];
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('injects authorization, admin token, and store headers from local storage', async () => {
    localStorage.setItem('auth_token', 'tok-local');
    localStorage.setItem('auth_store', 'store-123');

    const interceptor = getRequestInterceptor();
    const config = await interceptor({ headers: {}, method: 'get' });

    expect(config.headers.Authorization).toBe('Bearer tok-local');
    expect(config.headers['x-admin-token']).toBe('tok-local');
    expect(config.headers['x-store-id']).toBe('store-123');
  });

  it('falls back to the js-readable cookie token when storage is empty', async () => {
    document.cookie = 'auth_token_js=tok-cookie; Path=/';

    const interceptor = getRequestInterceptor();
    const config = await interceptor({ headers: {}, method: 'get' });

    expect(config.headers.Authorization).toBe('Bearer tok-cookie');
    expect(config.headers['x-admin-token']).toBe('tok-cookie');
  });

  it('builds api urls with a normalized /api suffix', () => {
    expect(buildApiUrl('/listings/available')).toContain('/api/listings/available');
  });

  it('rejects html responses from api calls', async () => {
    const interceptor = getResponseInterceptor();
    const response = {
      data: '<html><body>oops</body></html>',
      headers: { 'content-type': 'text/html; charset=utf-8' },
    };

    await expect(interceptor(response)).rejects.toMatchObject({
      message: 'Unexpected HTML response from API; check backend or _redirects rules',
      response,
    });
  });

  it('retries transient GET errors and returns retried response', async () => {
    vi.useFakeTimers();
    const rejected = getResponseErrorInterceptor();
    const requestSpy = vi.spyOn(apiClient, 'request').mockResolvedValue({ data: { ok: true } } as any);

    const retryPromise = rejected({
      config: { method: 'get', headers: {} },
      response: undefined,
    });

    await vi.advanceTimersByTimeAsync(400);
    await expect(retryPromise).resolves.toEqual({ data: { ok: true } });
    expect(requestSpy).toHaveBeenCalledTimes(1);

    requestSpy.mockRestore();
    vi.useRealTimers();
  });

  it('handles auth-probe 401 responses by clearing auth token and redirecting to login', async () => {
    const rejected = getResponseErrorInterceptor();
    localStorage.setItem('auth_token', 'tok-local');
    window.history.pushState({}, '', '/precios');

    await expect(
      rejected({
        config: { method: 'get', url: '/admin/auth/me', headers: {} },
        response: { status: 401 },
      }),
    ).rejects.toBeTruthy();

    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(window.location.pathname).toBe('/login');
    expect(window.location.search).toContain('next=%2Fprecios');
  });

  it('does not clear session on non-auth 401 responses when token exists', async () => {
    const rejected = getResponseErrorInterceptor();
    localStorage.setItem('auth_token', 'tok-local');
    window.history.pushState({}, '', '/stock-bajo');

    await expect(
      rejected({
        config: { method: 'get', url: '/listings/available', headers: {} },
        response: { status: 401 },
      }),
    ).rejects.toBeTruthy();

    expect(localStorage.getItem('auth_token')).toBe('tok-local');
    expect(window.location.pathname).toBe('/stock-bajo');
  });
});
