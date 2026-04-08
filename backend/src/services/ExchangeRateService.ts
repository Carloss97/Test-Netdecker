// src/services/ExchangeRateService.ts
import axios from 'axios';
import prisma from '../utils/db.js';
import { cacheGet, cacheSet } from '../utils/redis.js';

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
   * Get USD to CLP exchange rate from cache or external API
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

    // Fetch from API
    const { rate, usedFallback } = await this.fetchRate('USD', 'CLP');
    
    // Save to database
    await prisma.exchangeRate.upsert({
      where: {
        fromCurrency_toCurrency: {
          fromCurrency: 'USD',
          toCurrency: 'CLP',
        }
      },
      update: {
        rate,
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + CACHE_TTL * 1000),
      },
      create: {
        fromCurrency: 'USD',
        toCurrency: 'CLP',
        rate,
        source: 'exchangerate-api.com',
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + CACHE_TTL * 1000),
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
      retrievalSource: usedFallback ? 'fallback' : 'api',
      provider: refreshedRate?.source,
      fetchedAt: refreshedRate?.fetchedAt,
      expiresAt: refreshedRate?.expiresAt,
    };
  }

  static async setManualUSDtoCLPRate(rate: number): Promise<void> {
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error('Manual exchange rate must be a positive number');
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
    const { rate } = await this.fetchRate('USD', 'CLP');

    await prisma.exchangeRate.upsert({
      where: {
        fromCurrency_toCurrency: {
          fromCurrency: 'USD',
          toCurrency: 'CLP',
        }
      },
      update: {
        rate,
        source: 'exchangerate-api.com',
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + CACHE_TTL * 1000),
      },
      create: {
        fromCurrency: 'USD',
        toCurrency: 'CLP',
        rate,
        source: 'exchangerate-api.com',
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + CACHE_TTL * 1000),
      }
    });

    await cacheSet(CACHE_KEY, rate, CACHE_TTL);
    return rate;
  }

  /**
   * Fetch rate from external API
   */
  private static async fetchRate(from: string, to: string): Promise<{ rate: number; usedFallback: boolean }> {
    try {
      const apiUrl = process.env.EXCHANGE_RATE_API_URL || 'https://api.exchangerate-api.com/v4/latest';
      const response = await axios.get(`${apiUrl}/${from}`);
      const rate = response.data.rates[to];
      
      if (!rate) {
        throw new Error(`Exchange rate not found for ${from} to ${to}`);
      }

      return { rate, usedFallback: false };
    } catch (error) {
      console.error('Failed to fetch exchange rate:', error);
      // Fallback: use a reasonable default (placeholder)
      console.warn('Using fallback exchange rate');
      return { rate: 850, usedFallback: true }; // Approximate CLP/USD rate
    }
  }
}
