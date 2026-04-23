import { getRedisClient } from '../utils/redis.js';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  source: 'redis' | 'unavailable';
}

type RedisRateLimitClient = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
};

export class RateLimitService {
  private static async resolveRedisClient(): Promise<RedisRateLimitClient | null> {
    try {
      return await getRedisClient();
    } catch {
      return null;
    }
  }

  static async checkLimit(
    key: string,
    limit: number,
    windowMs: number,
    client?: RedisRateLimitClient,
  ): Promise<RateLimitResult> {
    const safeLimit = Math.max(1, Math.floor(limit));
    const safeWindowMs = Math.max(1000, Math.floor(windowMs));
    const resetAt = new Date(Date.now() + safeWindowMs);

    const redisClient = client ?? await this.resolveRedisClient();
    if (!redisClient) {
      return {
        allowed: true,
        remaining: safeLimit,
        resetAt,
        source: 'unavailable',
      };
    }

    try {
      const count = await redisClient.incr(key);
      if (count === 1) {
        await redisClient.expire(key, Math.ceil(safeWindowMs / 1000));
      }

      return {
        allowed: count <= safeLimit,
        remaining: Math.max(0, safeLimit - count),
        resetAt,
        source: 'redis',
      };
    } catch {
      return {
        allowed: true,
        remaining: safeLimit,
        resetAt,
        source: 'unavailable',
      };
    }
  }
}

export default RateLimitService;