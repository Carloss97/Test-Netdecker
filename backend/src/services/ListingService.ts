
// src/services/ListingService.ts
import prisma from '../utils/db.js';
import { Prisma } from '@prisma/client';
import { PriceService } from './PriceService.js';
import { CardCondition, PriceUpdateReason } from '@prisma/client';
import { resolveMarginMultiplier } from '../config/pricing.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import AuditService from './AuditService.js';

interface CreateListingInput {
  storeId: string;
  cardId: string;
  condition: CardCondition;
  quantity: number;
  referencePrice: number;
  marginMultiplier?: number;
  costPrice?: number;
}

export class ListingService {
  private static async resolveChangedByUserId(changedBy?: string): Promise<string | null> {
    const raw = String(changedBy || '').trim();
    if (!raw || raw.toLowerCase() === 'system') {
      return null;
    }

    const admin = await prisma.adminUser.findUnique({ where: { id: raw }, select: { id: true } });
    return admin?.id || null;
  }

  /**
   * Create a new listing
   */
  static async createListing(input: CreateListingInput) {
    const storeId = String(input.storeId || '').trim();
    if (!storeId) {
      throw new ValidationError('storeId is required to create a listing');
    }

    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
    if (!store) {
      throw new NotFoundError(`Store not found: ${storeId}`);
    }

    const card = await prisma.card.findUnique({
      where: { id: input.cardId },
      select: { editionId: true, rarity: true }
    });

    if (!card) {
      throw new NotFoundError(`Card not found: ${input.cardId}`);
    }

    const marginMultiplier = resolveMarginMultiplier(input.marginMultiplier);
    const calculation = await PriceService.calculateFinalPrice({
      referencePrice: input.referencePrice,
      marginMultiplier,
    });

    return prisma.listing.create({
      data: {
        storeId,
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
  static async getListing(id: string, storeId?: string) {
    return prisma.listing.findFirst({
      where: {
        id,
        ...(storeId ? { storeId } : {}),
      },
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
  static async getListingsByCard(cardId: string, storeId?: string) {
    return prisma.listing.findMany({
      where: {
        cardId,
        ...(storeId ? { storeId } : {}),
      },
      include: { card: true }
    });
  }

  /**
   * Get available listings (with stock > 0)
   */
  static async getAvailableListings(tcgId?: string, editionId?: string, storeId?: string, search?: string) {
    const where: Prisma.ListingWhereInput = {
      AND: [
        { quantity: { gt: 0 } },
        { status: { in: ['active', 'manual'] } }
      ]
    };

    if (search && search.trim().length > 0) {
      const s = search.trim();
      (where.AND as any).push({
        card: {
          OR: [
            { cardName: { contains: s, mode: 'insensitive' } },
            { cardCode: { contains: s, mode: 'insensitive' } }
          ]
        }
      });
    }

    if (tcgId || editionId) {
      const cardFilter: any = where.card || {};
      if (tcgId) cardFilter.tcgId = tcgId;
      if (editionId) cardFilter.editionId = editionId;
      where.card = cardFilter;
    }

    if (storeId) {
      where.storeId = storeId;
    }

    const listings = await prisma.listing.findMany({
      where,
      include: {
        card: {
          include: { tcg: true, edition: true }
        }
      },
      orderBy: { finalPrice: 'asc' }
    });

    // Clean and Return results for Storefront
    return listings.map(l => {
      const listing = l as any;
      return {
        ...listing,
        // Use readable names instead of UUIDs
        editionName: listing.card?.edition?.editionName || listing.card?.edition?.editionCode || 'Unknown',
        tcgName: listing.card?.tcg?.name || 'Unknown',
        // Return original price as requested (no custom rounding here, should match admin)
        finalPrice: listing.finalPrice,
        cardName: listing.card?.cardName || 'Unknown Card',
        imageUrl: listing.card?.imageUrl || '',
      };
    });
  }

  /**
   * List listings with pagination and optional filtering.
   */
  static async listListings(options?: { take?: number; skip?: number; tcgId?: string; editionId?: string; storeId?: string }) {
    const take = options?.take ?? 20;
    const skip = options?.skip ?? 0;

    const where: Prisma.ListingWhereInput = {};
    if (options?.tcgId || options?.editionId) {
      where.card = {} as any;
      if (options?.tcgId) (where.card as any).tcgId = options.tcgId;
      if (options?.editionId) (where.card as any).editionId = options.editionId;
    }

    if (options?.storeId) {
      where.storeId = options.storeId;
    }

    return prisma.listing.findMany({
      where,
      include: { card: { include: { tcg: true, edition: true } } },
      take,
      skip,
      orderBy: { finalPrice: 'asc' }
    });
  }

  /**
   * Update listing quantity (e.g., after purchase)
   */
  static async updateQuantity(id: string, quantity: number, changedBy?: string) {
    const safeQty = Math.max(0, quantity);
    const existing = await prisma.listing.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Listing not found: ${id}`);
    }

    const updated = await prisma.listing.update({
      where: { id },
      data: {
        quantity: safeQty,
        // Once a listing has stock, mark it permanently
        ...(safeQty > 0 ? { everHadStock: true } : {}),
        // If stock is restored, ensure it becomes visible in pricing/storefront filters.
        ...(safeQty > 0 && existing.status !== 'manual' ? { status: 'active' } : {}),
      },
      include: { card: true }
    });

    await AuditService.auditEntityChange({
      entityType: 'listing',
      entityId: id,
      operation: 'UPDATE',
      oldValue: { quantity: existing.quantity },
      newValue: { quantity: safeQty },
      changedBy: await this.resolveChangedByUserId(changedBy),
      action: 'LISTING.QUANTITY.UPDATE',
    });

    return updated;
  }

  /**
   * Re-enable legacy listings that still have stock but were left hidden by an old status.
   */
  static async normalizeInStockStatuses(storeId?: string, changedBy?: string) {
    const scopeStoreId = typeof storeId === 'string' ? storeId.trim() : '';
    const where: Prisma.ListingWhereInput = {
      status: { notIn: ['active', 'manual'] },
      quantity: { gt: 0 },
      ...(scopeStoreId ? { storeId: scopeStoreId } : {}),
    };

    const affectedListings = await prisma.listing.findMany({
      where,
      select: { id: true },
    });

    if (affectedListings.length === 0) {
      return { updated: 0 };
    }

    await prisma.listing.updateMany({
      where: { id: { in: affectedListings.map((listing) => listing.id) } },
      data: {
        status: 'active',
        everHadStock: true,
      },
    });

    await AuditService.auditEntityChange({
      entityType: 'listing',
      entityId: scopeStoreId || 'all-stores',
      operation: 'UPDATE',
      oldValue: { hiddenByStatus: affectedListings.length },
      newValue: { hiddenByStatus: 0 },
      changedBy: await this.resolveChangedByUserId(changedBy),
      action: 'LISTING.STATUS.NORMALIZE_IN_STOCK',
      data: {
        scopeStoreId: scopeStoreId || null,
        affectedListingIds: affectedListings.map((listing) => listing.id),
      },
    });

    return { updated: affectedListings.length };
  }

  /**
   * Decrease quantity (for purchases)
   */
  static async decreaseQuantity(id: string, amount: number, changedBy?: string) {
    const listing = await this.getListing(id);
    if (!listing) throw new NotFoundError(`Listing not found: ${id}`);

    const newQuantity = Math.max(0, listing.quantity - amount);
    return this.updateQuantity(id, newQuantity, changedBy);
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
  static async getLowStockAlerts(threshold: number = 5, storeId?: string) {
    return prisma.listing.findMany({
      where: {
        AND: [
          { quantity: { lte: threshold, gt: 0 } },
          { status: { in: ['active', 'manual'] } }
        ],
        ...(storeId ? { storeId } : {}),
      },
      include: {
        card: {
          include: {
            tcg: true,
            edition: true,
          },
        },
      },
      orderBy: { quantity: 'asc' }
    });
  }

  /**
   * Get out of stock listings
   */
  static async getOutOfStock(storeId?: string) {
    return prisma.listing.findMany({
      where: {
        quantity: 0,
        ...(storeId ? { storeId } : {}),
      },
      include: { card: true }
    });
  }

  /**
   * Update margin multiplier for a listing
   */
  static async updateMargin(id: string, marginMultiplier: number) {
    const listing = await this.getListing(id);
    if (!listing) throw new NotFoundError(`Listing not found: ${id}`);

    return prisma.listing.update({
      where: { id },
      data: { marginMultiplier }
    });
  }

  /**
   * Get total inventory value (cost basis)
   */
  static async getInventoryValue(storeId?: string) {
    const listings = await prisma.listing.findMany({
      where: {
        quantity: { gt: 0 },
        ...(storeId ? { storeId } : {}),
      },
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
      throw new ValidationError('manualFinalPrice must be a positive number');
    }

    const listing = await this.getListing(id);
    if (!listing) {
      throw new NotFoundError(`Listing not found: ${id}`);
    }

    const oldPrice = listing.finalPrice;
    const changedByUserId = await this.resolveChangedByUserId(changedBy);
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
          changedBy: changedByUserId,
          notes: notes || 'Manual price override enabled',
        },
      }),
    ]);

    await AuditService.auditEntityChange({
      entityType: 'listing',
      entityId: id,
      operation: 'UPDATE',
      oldValue: { finalPrice: oldPrice, status: listing.status },
      newValue: { finalPrice: manualFinalPrice, status: 'manual' },
      changedBy: changedByUserId,
      action: 'LISTING.PRICE.MANUAL_OVERRIDE',
      data: {
        notes: notes || 'Manual price override enabled',
        changedByRaw: changedBy || null,
      },
    });

    return this.getListing(id);
  }

  /**
   * Restore API-managed pricing for a listing and recalculate from reference price.
   */
  static async setApiPricingMode(id: string, changedBy: string = 'system', notes?: string) {
    const listing = await this.getListing(id);
    if (!listing) {
      throw new NotFoundError(`Listing not found: ${id}`);
    }

    const calculation = await PriceService.calculateFinalPrice({
      referencePrice: listing.referencePrice,
      marginMultiplier: listing.marginMultiplier,
    });

    const oldPrice = listing.finalPrice;
    const changedByUserId = await this.resolveChangedByUserId(changedBy);
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
          changedBy: changedByUserId,
          notes: notes || 'Manual override disabled, API pricing restored',
        },
      }),
    ]);

    await AuditService.auditEntityChange({
      entityType: 'listing',
      entityId: id,
      operation: 'UPDATE',
      oldValue: { finalPrice: oldPrice, status: listing.status },
      newValue: { finalPrice: calculation.finalPrice, status: 'active' },
      changedBy: changedByUserId,
      action: 'LISTING.PRICE.API_MODE_RESTORE',
      data: {
        notes: notes || 'Manual override disabled, API pricing restored',
        changedByRaw: changedBy || null,
      },
    });

    return this.getListing(id);
  }
}
