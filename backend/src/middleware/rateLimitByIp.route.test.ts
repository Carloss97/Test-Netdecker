import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

import { rateLimitByIp } from './rateLimitByIp.js';
import { RateLimitService } from '../services/RateLimitService.js';

describe('rateLimitByIp middleware', () => {
  test('sets headers and calls next when allowed', async () => {
    const original = RateLimitService.checkLimit;
    try {
      RateLimitService.checkLimit = (async () => ({
        allowed: true,
        remaining: 4,
        resetAt: new Date('2026-04-23T00:00:00.000Z'),
        source: 'redis',
      })) as typeof RateLimitService.checkLimit;

      const middleware = rateLimitByIp(5, 60000);
      const headers: Record<string, string> = {};
      let nextCalled = false;
      const expectedReset = String(Math.ceil(new Date('2026-04-23T00:00:00.000Z').getTime() / 1000));

      await middleware(
        {
          method: 'POST',
          baseUrl: '/api/admin',
          path: '/pricing-config',
          ip: '127.0.0.1',
          socket: { remoteAddress: '127.0.0.1' },
          headers: {},
        } as any,
        {
          setHeader: (name: string, value: string) => {
            headers[name] = value;
          },
        } as any,
        () => {
          nextCalled = true;
        },
      );

      assert.equal(nextCalled, true);
      assert.equal(headers['X-RateLimit-Limit'], '5');
      assert.equal(headers['X-RateLimit-Remaining'], '4');
      assert.equal(headers['X-RateLimit-Reset'], expectedReset);
    } finally {
      RateLimitService.checkLimit = original;
    }
  });

  test('throws 429 when the limit is exceeded', async () => {
    const original = RateLimitService.checkLimit;
    try {
      RateLimitService.checkLimit = (async () => ({
        allowed: false,
        remaining: 0,
        resetAt: new Date('2026-04-23T00:00:00.000Z'),
        source: 'redis',
      })) as typeof RateLimitService.checkLimit;

      const middleware = rateLimitByIp(5, 60000);
      await assert.rejects(
        async () => middleware(
          {
            method: 'POST',
            baseUrl: '/api/admin',
            path: '/pricing-config',
            ip: '127.0.0.1',
            socket: { remoteAddress: '127.0.0.1' },
            headers: {},
          } as any,
          { setHeader: () => undefined } as any,
          () => undefined,
        ),
        (err: any) => err?.statusCode === 429 && err?.code === 'TOO_MANY_REQUESTS',
      );
    } finally {
      RateLimitService.checkLimit = original;
    }
  });
});
