// src/utils/redis.ts
import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;
let redisUnavailable = false;
let warnedUnavailable = false;

function warnRedisUnavailable(err: unknown): void {
  if (warnedUnavailable) {
    return;
  }

  warnedUnavailable = true;
  console.warn('Redis unavailable, continuing without cache.');
  if (err instanceof Error) {
    console.warn(`Redis details: ${err.message}`);
  }
}

export async function getRedisClient(): Promise<RedisClientType> {
  if (redisUnavailable) {
    throw new Error('Redis unavailable');
  }

  if (redisClient) {
    return redisClient;
  }

  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  redisClient = createClient({ url });

  redisClient.on('error', (err) => {
    redisUnavailable = true;
    warnRedisUnavailable(err);
  });
  redisClient.on('connect', () => console.log('Redis Client Connected'));

  try {
    await redisClient.connect();
  } catch (err) {
    redisUnavailable = true;
    redisClient = null;
    warnRedisUnavailable(err);
    throw new Error('Redis unavailable');
  }

  return redisClient;
}

export async function cacheGet(key: string): Promise<any | null> {
  try {
    const client = await getRedisClient();
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: any, expirationSeconds?: number): Promise<void> {
  try {
    const client = await getRedisClient();
    const options = expirationSeconds ? { EX: expirationSeconds } : undefined;
    await client.set(key, JSON.stringify(value), options);
  } catch {
    // Ignore cache writes when Redis is unavailable.
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    const client = await getRedisClient();
    await client.del(key);
  } catch {
    // Ignore cache deletes when Redis is unavailable.
  }
}
