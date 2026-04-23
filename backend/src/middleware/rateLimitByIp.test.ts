import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

import { rateLimitByIp } from './rateLimitByIp.js';
import { RateLimitService } from '../services/RateLimitService.js';

describe('rateLimitByIp', () => {
  test('sets headers and allows the request when under the limit', async () => {
    const original = RateLimitService.checkLimit;
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

    const req: any = {
      method: 'POST',
      baseUrl: '/api/admin',
      path: '/pricing-config',
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
    };

    const res: any = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    };

    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(headers['X-RateLimit-Limit'], '5');
    assert.equal(headers['X-RateLimit-Remaining'], '4');
    assert.equal(headers['X-RateLimit-Reset'], expectedReset);

    RateLimitService.checkLimit = original;
  });

  test('throws TooManyRequestsError when the limit is exceeded', async () => {
    const original = RateLimitService.checkLimit;
    RateLimitService.checkLimit = (async () => ({
      allowed: false,
      remaining: 0,
      resetAt: new Date('2026-04-23T00:00:00.000Z'),
      source: 'redis',
    })) as typeof RateLimitService.checkLimit;

    const middleware = rateLimitByIp(5, 60000);
    const req: any = {
      method: 'POST',
      baseUrl: '/api/admin',
      path: '/pricing-config',
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
    };

    const res: any = {
      setHeader: () => undefined,
    };

    await assert.rejects(
      async () => middleware(req, res, () => undefined),
      (err: any) => err?.statusCode === 429 && err?.code === 'TOO_MANY_REQUESTS',
    );

    RateLimitService.checkLimit = original;
  });
});
