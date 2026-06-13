import axios from 'axios';
import { cacheGet, cacheSet } from '../utils/redis.js';

interface TcgplayerTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface TcgplayerPriceResult {
  lowPrice?: number;
  midPrice?: number;
  marketPrice?: number;
  subTypeName?: string;
}

interface TcgplayerPricingResponse {
  success: boolean;
  errors?: string[];
  results?: TcgplayerPriceResult[];
}

const TCGPLAYER_AUTH_URL = 'https://api.tcgplayer.com/token';
const TCGPLAYER_PRICING_URL = 'https://api.tcgplayer.com/pricing/product';
const TOKEN_CACHE_KEY = 'tcgplayer:oauth:token';
const PRODUCT_CACHE_TTL_SECONDS = 60 * 60 * 6;
const MIN_REQUEST_INTERVAL_MS = 7000;
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeRarity(rarity?: string): string {
  return (rarity || '').trim().toLowerCase();
}

export class TCGPlayerService {
  private static inMemoryToken: { value: string; expiresAt: number } | null = null;
  private static requestQueue: Promise<void> = Promise.resolve();
  private static lastRequestAt = 0;

  static isConfigured(): boolean {
    return Boolean(process.env.TCGPLAYER_API_KEY && process.env.TCGPLAYER_API_SECRET);
  }

  private static async getAccessToken(): Promise<string | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const now = Date.now();
    if (this.inMemoryToken && this.inMemoryToken.expiresAt > now + 60_000) {
      return this.inMemoryToken.value;
    }

    const cached = await cacheGet<{ accessToken?: string; expiresAt?: number }>(TOKEN_CACHE_KEY);
    if (cached?.accessToken && cached?.expiresAt && cached.expiresAt > now + 60_000) {
      this.inMemoryToken = { value: cached.accessToken, expiresAt: cached.expiresAt };
      return cached.accessToken as string;
    }

    try {
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.TCGPLAYER_API_KEY || '',
        client_secret: process.env.TCGPLAYER_API_SECRET || '',
      });

      const { data } = await axios.post<TcgplayerTokenResponse>(TCGPLAYER_AUTH_URL, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
      });

      const expiresAt = now + Math.max((data.expires_in - 120) * 1000, 60_000);
      this.inMemoryToken = { value: data.access_token, expiresAt };
      await cacheSet(TOKEN_CACHE_KEY, { accessToken: data.access_token, expiresAt }, data.expires_in - 120);
      return data.access_token;
    } catch {
      return null;
    }
  }

  private static async enqueue<T>(task: () => Promise<T>): Promise<T> {
    let releaseQueue: (() => void) | undefined;
    const previousQueue = this.requestQueue;
    this.requestQueue = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });

    await previousQueue;

    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }

    this.lastRequestAt = Date.now();

    try {
      return await task();
    } finally {
      releaseQueue?.();
    }
  }

  private static async requestWithRetry<T>(task: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      try {
        return await task();
      } catch (err) {
        lastError = err;
        const status = (err as { response?: { status?: number; headers?: Record<string, string> } }).response?.status;
        if (status !== 429 || attempt === MAX_RETRIES - 1) {
          throw err;
        }

        const retryAfterHeader = (err as { response?: { headers?: Record<string, string> } }).response?.headers?.['retry-after'];
        const retryAfterSeconds = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : 60;
        await sleep(Math.max(retryAfterSeconds, 1) * 1000);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('TCGplayer request failed');
  }

  static async getProductPrices(productId: number): Promise<TcgplayerPriceResult[]> {
    const cacheKey = `tcgplayer:pricing:${productId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return cached as TcgplayerPriceResult[];
    }

    const token = await this.getAccessToken();
    if (!token) {
      return [];
    }

    try {
      const response = await this.enqueue(() => this.requestWithRetry(() => axios.get<TcgplayerPricingResponse>(`${TCGPLAYER_PRICING_URL}/${productId}`, {
        headers: { Authorization: `bearer ${token}` },
        timeout: 10000,
      })));
      const data = response.data;

      const results = Array.isArray(data.results) ? data.results : [];
      await cacheSet(cacheKey, results, PRODUCT_CACHE_TTL_SECONDS);
      return results;
    } catch {
      return [];
    }
  }

  static async getMarketPriceByProduct(productId: number, rarity?: string): Promise<number | null> {
    const prices = await this.getProductPrices(productId);
    if (!prices.length) {
      return null;
    }

    const targetRarity = normalizeRarity(rarity);
    const matched = targetRarity
      ? prices.find((p) => normalizeRarity(p.subTypeName).includes(targetRarity))
      : undefined;

    const candidate = matched || prices[0];
    const selected = candidate.marketPrice ?? candidate.midPrice ?? candidate.lowPrice;

    return typeof selected === 'number' && Number.isFinite(selected) ? selected : null;
  }
}
