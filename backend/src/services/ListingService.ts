
// src/services/ListingService.ts
import prisma from '../utils/db.js';
import { Prisma } from '@prisma/client';
import { PriceService } from './PriceService.js';
import { CardCondition, PriceUpdateReason } from '@prisma/client';
import { resolveMarginMultiplier } from '../config/pricing.js';

interface CreateListingInput {
  cardId: string;
  condition: CardCondition;
  quantity: number;
  referencePrice: number;
  marginMultiplier?: number;
  costPrice?: number;
}

export class ListingService {
  /**
   * Create a new listing
   */
  static async createListing(input: CreateListingInput) {
    const card = await prisma.card.findUnique({
      where: { id: input.cardId },
      select: { editionId: true, rarity: true }
    });

    if (!card) {
      throw new Error(`Card not found: ${input.cardId}`);
    }

    const marginMultiplier = resolveMarginMultiplier(input.marginMultiplier);
    const calculation = await PriceService.calculateFinalPrice({
      referencePrice: input.referencePrice,
      marginMultiplier,
    });

    return prisma.listing.create({
      data: {
        cardId: input.cardId,
        condition: input.condition,
        rarity: card.rarity,
        quantity: input.quantity,
        referencePrice: input.referencePrice,
        marginMultiplier,
        finalPrice: calculation.finalPrice,
        exchangeRate: calculation.exchangeRate,
        costPrice: input.costPrice,
        editionId: card.editionId,
      },
      include: { card: true }
    });
  }

  /**
   * Get listing by ID
   */
  static async getListing(id: string) {
    return prisma.listing.findUnique({
      where: { id },
      include: {
        card: {
          include: { tcg: true, edition: true }
        }
      }
    });
  }

  /**
   * Get all listings for a card
   */
  static async getListingsByCard(cardId: string) {
    return prisma.listing.findMany({
      where: { cardId },
      include: { card: true }
    });
  }

  /**
   * Get available listings (with stock > 0)
   */
  static async getAvailableListings(tcgId?: string, editionId?: string) {
    const where: Prisma.ListingWhereInput = {
      AND: [
        { quantity: { gt: 0 } },
        { status: { in: ['active', 'manual'] } }
      ]
    };

    if (tcgId || editionId) {
      where.card = {};
      if (tcgId) where.card.tcgId = tcgId;
      if (editionId) where.card.editionId = editionId;
    }

    return prisma.listing.findMany({
      where,
      include: {
        card: {
          include: { tcg: true, edition: true }
        }
      },
      orderBy: { finalPrice: 'asc' }
    });
  }

  /**
   * Update listing quantity (e.g., after purchase)
   */
  static async updateQuantity(id: string, quantity: number) {
    const safeQty = Math.max(0, quantity);
    return prisma.listing.update({
      where: { id },
      data: {
        quantity: safeQty,
        // Once a listing has stock, mark it permanently
        ...(safeQty > 0 ? { everHadStock: true } : {}),
      },
      include: { card: true }
    });
  }

  /**
   * Decrease quantity (for purchases)
   */
  static async decreaseQuantity(id: string, amount: number) {
    const listing = await this.getListing(id);
    if (!listing) throw new Error(`Listing not found: ${id}`);

    const newQuantity = Math.max(0, listing.quantity - amount);
    return this.updateQuantity(id, newQuantity);
  }

  /**
   * Bulk update quantities from CSV
   */
  static async bulkUpdateQuantities(updates: Array<{ listingId: string; quantity: number }>) {
    const results: { updated: number; errors: Array<{ listingId: string; error: string }> } = {
      updated: 0,
      errors: []
    };

    for (const update of updates) {
      try {
        await this.updateQuantity(update.listingId, update.quantity);
        results.updated++;
      } catch (error: unknown) {
        results.errors.push({
          listingId: update.listingId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Get low stock alerts
   */
  static async getLowStockAlerts(threshold: number = 5) {
    return prisma.listing.findMany({
      where: {
        AND: [
          { quantity: { lte: threshold, gt: 0 } },
          { status: { in: ['active', 'manual'] } }
        ]
      },
      include: {
        card: {
          include: {
            edition: {
              select: {
                editionCode: true,
              },
            },
          },
        },
      },
      orderBy: { quantity: 'asc' }
    });
  }

  /**
   * Get out of stock listings
   */
  static async getOutOfStock() {
    return prisma.listing.findMany({
      where: { quantity: 0 },
      include: { card: true }
    });
  }

  /**
   * Update margin multiplier for a listing
   */
  static async updateMargin(id: string, marginMultiplier: number) {
    const listing = await this.getListing(id);
    if (!listing) throw new Error(`Listing not found: ${id}`);

    return prisma.listing.update({
      where: { id },
      data: { marginMultiplier }
    });
  }

  /**
   * Get total inventory value (cost basis)
   */
  static async getInventoryValue() {
    const listings = await prisma.listing.findMany({
      where: { quantity: { gt: 0 } },
      select: {
        quantity: true,
        costPrice: true,
        finalPrice: true
      }
    });

    type InventoryListing = { quantity: number; costPrice?: number | null; finalPrice: number };

    const totalCost = (listings as InventoryListing[]).reduce((sum: number, l: InventoryListing) => sum + (l.costPrice ?? 0) * l.quantity, 0);
    const totalValue = (listings as InventoryListing[]).reduce((sum: number, l: InventoryListing) => sum + l.finalPrice * l.quantity, 0);

    return {
      totalCost,
      totalValue,
      totalProfit: totalValue - totalCost,
      itemCount: (listings as InventoryListing[]).reduce((sum: number, l: InventoryListing) => sum + l.quantity, 0)
    };
  }

  /**
   * Force a manual final CLP price for a listing and lock it from global API sync.
   */
  static async setManualPrice(id: string, manualFinalPrice: number, changedBy: string = 'system', notes?: string) {
    if (!Number.isFinite(manualFinalPrice) || manualFinalPrice <= 0) {
      throw new Error('manualFinalPrice must be a positive number');
    }

    const listing = await this.getListing(id);
    if (!listing) {
      throw new Error(`Listing not found: ${id}`);
    }

    const oldPrice = listing.finalPrice;
    const percentChange = oldPrice === 0
      ? (manualFinalPrice > 0 ? 100 : 0)
      : ((manualFinalPrice - oldPrice) / oldPrice) * 100;

    await prisma.$transaction([
      prisma.listing.update({
        where: { id },
        data: {
          finalPrice: manualFinalPrice,
          status: 'manual',
          lastSyncedAt: new Date(),
        },
      }),
      prisma.priceHistory.create({
        data: {
          listingId: id,
          oldPrice,
          newPrice: manualFinalPrice,
          oldReferencePrice: listing.referencePrice,
          newReferencePrice: listing.referencePrice,
          oldExchangeRate: listing.exchangeRate,
          newExchangeRate: listing.exchangeRate,
          reason: PriceUpdateReason.MANUAL_UPDATE,
          percentChange,
          changedBy,
          notes: notes || 'Manual price override enabled',
        },
      }),
    ]);

    return this.getListing(id);
  }

  /**
   * Restore API-managed pricing for a listing and recalculate from reference price.
   */
  static async setApiPricingMode(id: string, changedBy: string = 'system', notes?: string) {
    const listing = await this.getListing(id);
    if (!listing) {
      throw new Error(`Listing not found: ${id}`);
    }

    const calculation = await PriceService.calculateFinalPrice({
      referencePrice: listing.referencePrice,
      marginMultiplier: listing.marginMultiplier,
    });

    const oldPrice = listing.finalPrice;
    const percentChange = oldPrice === 0
      ? (calculation.finalPrice > 0 ? 100 : 0)
      : ((calculation.finalPrice - oldPrice) / oldPrice) * 100;

    await prisma.$transaction([
      prisma.listing.update({
        where: { id },
        data: {
          finalPrice: calculation.finalPrice,
          exchangeRate: calculation.exchangeRate,
          status: 'active',
          lastSyncedAt: new Date(),
        },
      }),
      prisma.priceHistory.create({
        data: {
          listingId: id,
          oldPrice,
          newPrice: calculation.finalPrice,
          oldReferencePrice: listing.referencePrice,
          newReferencePrice: listing.referencePrice,
          oldExchangeRate: listing.exchangeRate,
          newExchangeRate: calculation.exchangeRate,
          reason: PriceUpdateReason.MANUAL_UPDATE,
          percentChange,
          changedBy,
          notes: notes || 'Manual override disabled, API pricing restored',
        },
      }),
    ]);

    return this.getListing(id);
  }
}
