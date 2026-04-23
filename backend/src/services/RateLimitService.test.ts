import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

import { RateLimitService } from './RateLimitService.js';

describe('RateLimitService', () => {
  test('allows requests within the limit and sets expiry on the first hit', async () => {
    let count = 0;
    const expireCalls: Array<{ key: string; seconds: number }> = [];
    const client = {
      incr: async (_key: string) => {
        count += 1;
        return count;
      },
      expire: async (key: string, seconds: number) => {
        expireCalls.push({ key, seconds });
        return 1;
      },
    };

    const first = await RateLimitService.checkLimit('rate-limit:ip:/search', 5, 60000, client);
    const second = await RateLimitService.checkLimit('rate-limit:ip:/search', 5, 60000, client);

    assert.equal(first.allowed, true);
    assert.equal(first.remaining, 4);
    assert.equal(first.source, 'redis');
    assert.equal(second.allowed, true);
    assert.equal(second.remaining, 3);
    assert.equal(expireCalls.length, 1);
    assert.equal(expireCalls[0]?.key, 'rate-limit:ip:/search');
  });

  test('denies requests after the limit is exceeded', async () => {
    let count = 0;
    const client = {
      incr: async () => {
        count += 1;
        return count;
      },
      expire: async () => 1,
    };

    for (let i = 0; i < 5; i += 1) {
      const result = await RateLimitService.checkLimit('rate-limit:ip:/login', 5, 60000, client);
      assert.equal(result.allowed, true);
    }

    const blocked = await RateLimitService.checkLimit('rate-limit:ip:/login', 5, 60000, client);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
  });

  test('fails open when the redis client errors', async () => {
    const client = {
      incr: async () => {
        throw new Error('boom');
      },
      expire: async () => 1,
    };

    const result = await RateLimitService.checkLimit('rate-limit:ip:/pricing-config', 50, 60000, client);
    assert.equal(result.allowed, true);
    assert.equal(result.source, 'unavailable');
    assert.equal(result.remaining, 50);
  });
});
