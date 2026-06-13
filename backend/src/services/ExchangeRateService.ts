// src/services/ExchangeRateService.ts
import prisma from '../utils/db.js';
import { cacheGet, cacheSet } from '../utils/redis.js';
import { ValidationError } from '../utils/errors.js';
import { getManualUsdToClpRate } from '../config/appConfig.js';

const CACHE_KEY = 'exchange_rate:usd_clp';
const CACHE_TTL = 3600 * 6; // 6 hours

export interface ExchangeRateMeta {
  rate: number;
  retrievalSource: 'cache' | 'database' | 'api' | 'fallback';
  provider?: string;
  fetchedAt?: Date;
  expiresAt?: Date | null;
}

export class ExchangeRateService {
  /**
   * Get USD to CLP exchange rate from cache, database, or local manual fallback.
   */
  static async getUSDtoCLPRate(): Promise<number> {
    const meta = await this.getUSDtoCLPRateMeta();
    return meta.rate;
  }

  /**
   * Get USD to CLP exchange rate with retrieval metadata
   */
  static async getUSDtoCLPRateMeta(): Promise<ExchangeRateMeta> {
    const dbRate = await prisma.exchangeRate.findUnique({
      where: {
        fromCurrency_toCurrency: {
          fromCurrency: 'USD',
          toCurrency: 'CLP',
        }
      }
    });

    // Try cache first
    const cached = await cacheGet<number>(CACHE_KEY);
    if (typeof cached === 'number') {
      return {
        rate: cached,
        retrievalSource: 'cache',
        provider: dbRate?.source,
        fetchedAt: dbRate?.fetchedAt,
        expiresAt: dbRate?.expiresAt,
      };
    }

    // Try database (might be stale but valid)
    if (dbRate && (!dbRate.expiresAt || new Date() < dbRate.expiresAt)) {
      await cacheSet(CACHE_KEY, dbRate.rate, CACHE_TTL);
      return {
        rate: dbRate.rate,
        retrievalSource: 'database',
        provider: dbRate.source,
        fetchedAt: dbRate.fetchedAt,
        expiresAt: dbRate.expiresAt,
      };
    }

    const rate = getManualUsdToClpRate();

    // Save the local fallback to database so all pricing paths remain deterministic.
    await prisma.exchangeRate.upsert({
      where: {
        fromCurrency_toCurrency: {
          fromCurrency: 'USD',
          toCurrency: 'CLP',
        }
      },
      update: {
        rate,
        source: 'manual-local',
        fetchedAt: new Date(),
        expiresAt: null,
      },
      create: {
        fromCurrency: 'USD',
        toCurrency: 'CLP',
        rate,
        source: 'manual-local',
        fetchedAt: new Date(),
        expiresAt: null,
      }
    });

    // Cache it
    await cacheSet(CACHE_KEY, rate, CACHE_TTL);

    const refreshedRate = await prisma.exchangeRate.findUnique({
      where: {
        fromCurrency_toCurrency: {
          fromCurrency: 'USD',
          toCurrency: 'CLP',
        }
      }
    });

    return {
      rate,
      retrievalSource: 'fallback',
      provider: refreshedRate?.source,
      fetchedAt: refreshedRate?.fetchedAt,
      expiresAt: refreshedRate?.expiresAt,
    };
  }

  /**
   * Fast variant that returns cached or DB value without attempting an external API call.
   * Useful for dashboard endpoints that must remain responsive even when the API is slow.
   */
  static async getUSDtoCLPRateMetaFast(): Promise<ExchangeRateMeta | null> {
    // Try cache
    try {
      const cached = await cacheGet<number>(CACHE_KEY);
      if (typeof cached === 'number') {
        const dbRate = await prisma.exchangeRate.findUnique({
          where: {
            fromCurrency_toCurrency: { fromCurrency: 'USD', toCurrency: 'CLP' }
          }
        });

        return {
          rate: cached,
          retrievalSource: 'cache',
          provider: dbRate?.source,
          fetchedAt: dbRate?.fetchedAt,
          expiresAt: dbRate?.expiresAt,
        };
      }
    } catch (err) {
      // swallow cache errors — we'll try DB next
      console.warn('[ExchangeRateService] cache lookup failed:', err);
    }

    // Return DB value even if expired; avoid external API call to keep request fast
    const dbRate = await prisma.exchangeRate.findUnique({
      where: {
        fromCurrency_toCurrency: { fromCurrency: 'USD', toCurrency: 'CLP' }
      }
    });

    if (dbRate) {
      return {
        rate: dbRate.rate,
        retrievalSource: 'database',
        provider: dbRate.source,
        fetchedAt: dbRate.fetchedAt,
        expiresAt: dbRate.expiresAt,
      };
    }

    return null;
  }

  static async setManualUSDtoCLPRate(rate: number): Promise<void> {
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new ValidationError('Manual exchange rate must be a positive number');
    }

    await prisma.exchangeRate.upsert({
      where: {
        fromCurrency_toCurrency: {
          fromCurrency: 'USD',
          toCurrency: 'CLP',
        }
      },
      update: {
        rate,
        source: 'manual',
        fetchedAt: new Date(),
        expiresAt: null,
      },
      create: {
        fromCurrency: 'USD',
        toCurrency: 'CLP',
        rate,
        source: 'manual',
        fetchedAt: new Date(),
        expiresAt: null,
      }
    });

    await cacheSet(CACHE_KEY, rate, CACHE_TTL);
  }

  static async refreshUSDtoCLPRateFromApi(): Promise<number> {
    // Local MVP mode intentionally never calls exchange-rate providers.
    // Keep this method for route compatibility, but refresh from the configured manual rate.
    const rate = getManualUsdToClpRate();

    await prisma.exchangeRate.upsert({
      where: {
        fromCurrency_toCurrency: {
          fromCurrency: 'USD',
          toCurrency: 'CLP',
        }
      },
      update: {
        rate,
        source: 'manual-local',
        fetchedAt: new Date(),
        expiresAt: null,
      },
      create: {
        fromCurrency: 'USD',
        toCurrency: 'CLP',
        rate,
        source: 'manual-local',
        fetchedAt: new Date(),
        expiresAt: null,
      }
    });

    await cacheSet(CACHE_KEY, rate, CACHE_TTL);
    return rate;
  }

}
