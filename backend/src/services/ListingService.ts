
// src/services/ListingService.ts
import prisma from '../utils/db.js';
import { PriceService } from './PriceService.js';
import { CardCondition } from '@prisma/client';

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

    const calculation = await PriceService.calculateFinalPrice({
      referencePrice: input.referencePrice,
      marginMultiplier: input.marginMultiplier || 1.2,
    });

    return prisma.listing.create({
      data: {
        cardId: input.cardId,
        condition: input.condition,
        rarity: card.rarity,
        quantity: input.quantity,
        referencePrice: input.referencePrice,
        marginMultiplier: input.marginMultiplier || 1.2,
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
    const where: any = {
      AND: [
        { quantity: { gt: 0 } },
        { status: 'active' }
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
    const results = {
      updated: 0,
      errors: [] as any[]
    };

    for (const update of updates) {
      try {
        await this.updateQuantity(update.listingId, update.quantity);
        results.updated++;
      } catch (error) {
        results.errors.push({
          listingId: update.listingId,
          error: (error as Error).message
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
          { status: 'active' }
        ]
      },
      include: {
        card: true
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

    const totalCost = listings.reduce((sum, l) => sum + (l.costPrice || 0) * l.quantity, 0);
    const totalValue = listings.reduce((sum, l) => sum + l.finalPrice * l.quantity, 0);

    return {
      totalCost,
      totalValue,
      totalProfit: totalValue - totalCost,
      itemCount: listings.reduce((sum, l) => sum + l.quantity, 0)
    };
  }
}
