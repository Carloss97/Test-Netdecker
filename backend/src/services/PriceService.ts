// src/services/PriceService.ts
import prisma from '../utils/db.js';
import { ExchangeRateService } from './ExchangeRateService.js';
import { PriceUpdateReason } from '@prisma/client';
import PriceThresholdService from './PriceThresholdService.js';
import { NotFoundError } from '../utils/errors.js';

interface PriceCalculationInput {
  referencePrice: number; // USD
  marginMultiplier: number; // e.g., 1.2 = 20% markup
  roundingMultiple?: number; // e.g., 10, 50
}

interface PriceCalculationOutput {
  finalPrice: number; // CLP
  rawFinalPrice: number;
  exchangeRate: number;
  referencePrice: number;
  roundingMultiple: number;
}

interface PriceCalculationDetailedOutput extends PriceCalculationOutput {
  marginMultiplier: number;
  retrievalSource: 'cache' | 'database' | 'api' | 'fallback';
  provider?: string;
  fetchedAt?: Date;
  expiresAt?: Date | null;
  formula: string;
}

export class PriceService {
  static resolveRoundingMultiple(overrideRounding?: number): number {
    if (typeof overrideRounding === 'number' && Number.isFinite(overrideRounding) && overrideRounding >= 1) {
      return Math.max(1, Math.round(overrideRounding));
    }

    const envValue = Number(process.env.PRICE_ROUNDING_MULTIPLE || '1');
    if (!Number.isFinite(envValue) || envValue < 1) {
      return 1;
    }

    return Math.max(1, Math.round(envValue));
  }

  private static roundCommercialPrice(value: number, roundingMultiple: number): number {
    if (roundingMultiple <= 1) {
      return Math.round(value);
    }
    return Math.round(value / roundingMultiple) * roundingMultiple;
  }

  /**
   * Calculate final price in CLP based on reference price and margin
   */
  static async calculateFinalPrice(input: PriceCalculationInput): Promise<PriceCalculationOutput> {
    const exchangeRate = await ExchangeRateService.getUSDtoCLPRate();
    const rawFinalPrice = input.referencePrice * input.marginMultiplier * exchangeRate;
    const roundingMultiple = this.resolveRoundingMultiple(input.roundingMultiple);
    const finalPrice = this.roundCommercialPrice(rawFinalPrice, roundingMultiple);

    return {
      finalPrice,
      rawFinalPrice,
      exchangeRate,
      referencePrice: input.referencePrice,
      roundingMultiple,
    };
  }

  /**
   * Calculate final price and include metadata useful for debugging.
   */
  static async calculateFinalPriceDetailed(input: PriceCalculationInput): Promise<PriceCalculationDetailedOutput> {
    const rateMeta = await ExchangeRateService.getUSDtoCLPRateMeta();
    const rawFinalPrice = input.referencePrice * input.marginMultiplier * rateMeta.rate;
    const roundingMultiple = this.resolveRoundingMultiple(input.roundingMultiple);
    const finalPrice = this.roundCommercialPrice(rawFinalPrice, roundingMultiple);

    return {
      finalPrice,
      rawFinalPrice,
      exchangeRate: rateMeta.rate,
      referencePrice: input.referencePrice,
      roundingMultiple,
      marginMultiplier: input.marginMultiplier,
      retrievalSource: rateMeta.retrievalSource,
      provider: rateMeta.provider,
      fetchedAt: rateMeta.fetchedAt,
      expiresAt: rateMeta.expiresAt,
      formula: `${input.referencePrice} * ${input.marginMultiplier} * ${rateMeta.rate}`,
    };
  }

  /**
   * Update a listing's price and track the change
   */
  static async updateListingPrice(
    listingId: string,
    newReferencePrice: number,
    marginMultiplier: number,
    reason: PriceUpdateReason,
    changedBy?: string,
    notes?: string,
    roundingMultiple?: number,
  ): Promise<void> {
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) {
      throw new NotFoundError(`Listing not found: ${listingId}`);
    }

    const oldPrice = listing.finalPrice;

    // Calculate new price
    const calculation = await this.calculateFinalPrice({
      referencePrice: newReferencePrice,
      marginMultiplier,
      roundingMultiple,
    });

    // Create history record (avoid division-by-zero when old price is 0)
    const percentChange = oldPrice === 0
      ? (calculation.finalPrice > 0 ? 100 : 0)
      : ((calculation.finalPrice - oldPrice) / oldPrice) * 100;

    await prisma.$transaction([
      // Update listing
      prisma.listing.update({
        where: { id: listingId },
        data: {
          referencePrice: newReferencePrice,
          marginMultiplier,
          finalPrice: calculation.finalPrice,
          exchangeRate: calculation.exchangeRate,
          lastSyncedAt: new Date(),
        }
      }),

      // Record history
      prisma.priceHistory.create({
        data: {
          listingId,
          oldPrice,
          newPrice: calculation.finalPrice,
          oldReferencePrice: listing.referencePrice,
          newReferencePrice,
          oldExchangeRate: listing.exchangeRate,
          newExchangeRate: calculation.exchangeRate,
          reason,
          percentChange,
          changedBy,
          notes,
        }
      })
    ]);
  }

  /**
   * Check if a price change is volatile (exceeds safe threshold)
   * - If `thresholdOrCtx` is a number, it is used directly.
   * - If `thresholdOrCtx` is an object with `listingId`/`tcgName`/`editionId`, the service
   *   will resolve the configured threshold from DB (edition -> tcg -> env default).
   * Returns a Promise<boolean>.
   */
  static async isVolatileChange(
    oldPrice: number,
    newPrice: number,
    thresholdOrCtx: number | { listingId?: string; tcgName?: string; editionId?: string } | undefined = undefined,
  ): Promise<boolean> {
    if (oldPrice === 0) {
      // First priced import is not treated as volatility.
      return false;
    }

    let threshold: number;
    if (typeof thresholdOrCtx === 'number') {
      threshold = thresholdOrCtx;
    } else if (thresholdOrCtx && typeof thresholdOrCtx === 'object') {
      if (thresholdOrCtx.listingId) {
        threshold = await PriceThresholdService.getThresholdForListing(thresholdOrCtx.listingId);
      } else {
        threshold = await PriceThresholdService.getThreshold(thresholdOrCtx.tcgName ?? null, thresholdOrCtx.editionId ?? null);
      }
    } else {
      // No context provided: use env default
      threshold = await PriceThresholdService.getThreshold(undefined, undefined);
    }

    const percentChange = ((newPrice - oldPrice) / oldPrice) * 100;
    return Math.abs(percentChange) > threshold;
  }

  /**
   * Get price history for a listing
   */
  static async getPriceHistory(listingId: string, limit: number = 50) {
    return prisma.priceHistory.findMany({
      where: { listingId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get complete price history for CSV export (no pagination cap).
   * Supports optional filters: listingId, date range.
   */
  static async getPriceHistoryForExport(filters: {
    listingId?: string;
    from?: Date;
    to?: Date;
  } = {}) {
    const where: {
      listingId?: string;
      createdAt?: { gte?: Date; lte?: Date };
    } = {};

    if (filters.listingId) {
      where.listingId = filters.listingId;
    }

    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }

    return prisma.priceHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }
}
