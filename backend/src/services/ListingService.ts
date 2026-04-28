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

  static async createListing(input: CreateListingInput) {
    const storeId = String(input.storeId || '').trim();
    if (!storeId) throw new ValidationError('storeId is required');

    const card = await prisma.card.findUnique({
      where: { id: input.cardId },
      select: { editionId: true, rarity: true }
    });
    if (!card) throw new NotFoundError('Card not found');

    const marginMultiplier = resolveMarginMultiplier(input.marginMultiplier);
    const calculation = await PriceService.calculateFinalPrice({ referencePrice: input.referencePrice, marginMultiplier });

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

  static async getListing(id: string, storeId?: string) {
    return prisma.listing.findFirst({
      where: { id, ...(storeId ? { storeId } : {}) },
      include: { card: { include: { tcg: true, edition: true } } }
    });
  }

  static async getListingsByCard(cardId: string, storeId?: string) {
    return prisma.listing.findMany({
      where: { cardId, ...(storeId ? { storeId } : {}) },
      include: { card: true }
    });
  }

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
        OR: [
          { card: { cardName: { contains: s, mode: 'insensitive' } } },
          { card: { cardCode: { contains: s, mode: 'insensitive' } } },
          { card: { tags: { contains: s, mode: 'insensitive' } } },
          { card: { rarity: { contains: s, mode: 'insensitive' } } },
          { card: { tcg: { name: { contains: s as any, mode: 'insensitive' } } } },
          { card: { edition: { editionName: { contains: s, mode: 'insensitive' } } } }
        ]
      });
    }

    if (tcgId || editionId) {
      const cardFilter: any = {};
      if (tcgId) cardFilter.tcg = { OR: [{ id: tcgId }, { name: tcgId }] };
      if (editionId) cardFilter.edition = { OR: [{ id: editionId }, { editionName: editionId }, { editionCode: editionId }] };
      where.card = cardFilter;
    }

    if (storeId) where.storeId = storeId;

    const listings = await prisma.listing.findMany({
      where,
      include: { card: { include: { tcg: true, edition: true } } },
      orderBy: { finalPrice: 'asc' }
    });

    return listings.map(l => {
      const listing = l as any;
      const tcgName = listing.card?.tcg?.name || 'Unknown';
      const editionName = listing.card?.edition?.editionName || listing.card?.edition?.editionCode || 'Unknown';
      return {
        id: listing.id,
        storeId: listing.storeId,
        cardName: listing.card?.cardName || 'Unknown Card',
        cardCode: listing.card?.cardCode || 'N/A',
        tcgName,
        editionName,
        tcgId: tcgName,
        rarity: listing.card?.rarity || 'C',
        cardType: listing.card?.cardType || '',
        attribute: listing.card?.attribute || '',
        metadata: listing.card?.metadata || {},
        condition: listing.condition || 'NM',
        quantity: listing.quantity,
        finalPrice: PriceService.formatDisplayPrice(listing.finalPrice),
        imageUrl: listing.card?.imageUrl || '',
      };
    });
  }

  static async getLowStockAlerts(threshold: number = 5, storeId?: string) {
    const listings = await prisma.listing.findMany({
      where: {
        AND: [
          { quantity: { lte: threshold, gt: 0 } },
          { status: { in: ['active', 'manual'] } }
        ],
        ...(storeId ? { storeId } : {}),
      },
      include: { card: { include: { tcg: true, edition: true } } },
      orderBy: { quantity: 'asc' }
    });

    return listings.map(l => {
      const listing = l as any;
      const tcgName = listing.card?.tcg?.name || 'Unknown';
      const editionName = listing.card?.edition?.editionName || listing.card?.edition?.editionCode || 'Unknown';
      
      return {
        id: listing.id,
        storeId: listing.storeId,
        quantity: listing.quantity,
        finalPrice: PriceService.formatDisplayPrice(listing.finalPrice),
        status: listing.status,
        card: {
          id: listing.card?.id,
          cardName: listing.card?.cardName || 'Unknown Card',
          cardCode: listing.card?.cardCode || 'N/A',
          cardNumber: listing.card?.cardNumber || '',
          imageUrl: listing.card?.imageUrl || '',
          rarity: listing.card?.rarity || 'C',
          cardType: listing.card?.cardType || '',
          attribute: listing.card?.attribute || '',
          metadata: listing.card?.metadata || {},
          tcg: { name: tcgName },
          edition: { editionName, editionCode: listing.card?.edition?.editionCode }
        }
      };
    });
  }

  static async updateQuantity(id: string, quantity: number, changedBy?: string) {
    const safeQty = Math.max(0, quantity);
    const existing = await prisma.listing.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Listing not found');

    const updated = await prisma.listing.update({
      where: { id },
      data: {
        quantity: safeQty,
        ...(safeQty > 0 ? { everHadStock: true } : {}),
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

  static async decreaseQuantity(id: string, amount: number, changedBy?: string) {
    const existing = await prisma.listing.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Listing not found');
    return this.updateQuantity(id, Math.max(0, existing.quantity - amount), changedBy);
  }

  static async bulkUpdateQuantities(updates: { listingId: string; quantity: number }[], changedBy?: string) {
    let updated = 0;
    const errors: { listingId: string; error: string }[] = [];

    for (const item of updates) {
      try {
        await this.updateQuantity(item.listingId, item.quantity, changedBy);
        updated++;
      } catch (err: any) {
        errors.push({ listingId: item.listingId, error: err?.message || 'Unknown error' });
      }
    }

    return { updated, errors };
  }

  static async normalizeInStockStatuses(storeId?: string, changedBy?: string) {
    const listings = await prisma.listing.findMany({
      where: {
        AND: [
          { quantity: { gt: 0 } },
          { status: { not: 'active' } },
          { status: { not: 'manual' } },
          ...(storeId ? [{ storeId }] : [])
        ]
      },
      select: { id: true }
    });

    if (listings.length === 0) return { updated: 0 };

    const ids = listings.map(l => l.id);
    await prisma.listing.updateMany({
      where: { id: { in: ids } },
      data: { status: 'active', everHadStock: true }
    });

    await AuditService.auditEntityChange({
      entityType: 'listing',
      entityId: 'bulk-normalize',
      operation: 'UPDATE',
      newValue: { ids, status: 'active' },
      changedBy: await this.resolveChangedByUserId(changedBy),
      action: 'LISTING.BULK.NORMALIZE_STATUS',
    });

    return { updated: ids.length };
  }

  static async listListings(options?: { take?: number; skip?: number; tcgId?: string; editionId?: string; storeId?: string }) {
    const take = options?.take ?? 20;
    const skip = options?.skip ?? 0;
    const where: Prisma.ListingWhereInput = {
      ...(options?.storeId ? { storeId: options.storeId } : {})
    };
    if (options?.tcgId || options?.editionId) {
      const cardFilter: any = {};
      if (options.tcgId) cardFilter.tcgId = options.tcgId;
      if (options.editionId) cardFilter.editionId = options.editionId;
      where.card = cardFilter;
    }
    
    const listings = await prisma.listing.findMany({
      where,
      include: { card: { include: { tcg: true, edition: true } } },
      take,
      skip,
      orderBy: { finalPrice: 'asc' }
    });

    return listings.map(l => {
      const listing = l as any;
      const tcgName = listing.card?.tcg?.name || 'Unknown';
      const editionName = listing.card?.edition?.editionName || listing.card?.edition?.editionCode || 'Unknown';
      return {
        id: listing.id,
        storeId: listing.storeId,
        cardName: listing.card?.cardName || 'Unknown Card',
        cardCode: listing.card?.cardCode || 'N/A',
        tcgName,
        editionName,
        tcgId: tcgName,
        rarity: listing.card?.rarity || 'C',
        cardType: listing.card?.cardType || '',
        attribute: listing.card?.attribute || '',
        metadata: listing.card?.metadata || {},
        condition: listing.condition || 'NM',
        quantity: listing.quantity,
        costPrice: listing.costPrice,
        finalPrice: PriceService.formatDisplayPrice(listing.finalPrice),
        imageUrl: listing.card?.imageUrl || '',
        status: listing.status,
        lastSyncedAt: listing.lastSyncedAt,
        referencePrice: listing.referencePrice,
        card: {
          id: listing.card?.id,
          cardName: listing.card?.cardName,
          cardCode: listing.card?.cardCode,
          cardNumber: listing.card?.cardNumber,
          imageUrl: listing.card?.imageUrl,
          rarity: listing.card?.rarity,
          tcg: { name: tcgName },
          edition: { editionName, editionCode: listing.card?.edition?.editionCode }
        }
      };
    });
  }

  static async getInventoryValue(storeId?: string) {
    const listings = await prisma.listing.findMany({
      where: { quantity: { gt: 0 }, ...(storeId ? { storeId } : {}) },
      select: { quantity: true, costPrice: true, finalPrice: true }
    });
    const totalCost = listings.reduce((sum, l) => sum + (l.costPrice ?? 0) * l.quantity, 0);
    const totalValue = listings.reduce((sum, l) => sum + l.finalPrice * l.quantity, 0);
    return { totalCost, totalValue, totalProfit: totalValue - totalCost, itemCount: listings.reduce((sum, l) => sum + l.quantity, 0) };
  }

  static async setManualPrice(id: string, manualFinalPrice: number, changedBy: string = 'system', notes?: string) {
    const listing = await this.getListing(id);
    if (!listing) throw new NotFoundError('Listing not found');
    const oldPrice = listing.finalPrice;
    const changedByUserId = await this.resolveChangedByUserId(changedBy);
    await prisma.$transaction([
      prisma.listing.update({ where: { id }, data: { finalPrice: manualFinalPrice, status: 'manual', lastSyncedAt: new Date() } }),
      prisma.priceHistory.create({ data: { listingId: id, oldPrice, newPrice: manualFinalPrice, oldReferencePrice: listing.referencePrice, newReferencePrice: listing.referencePrice, oldExchangeRate: listing.exchangeRate, newExchangeRate: listing.exchangeRate, reason: PriceUpdateReason.MANUAL_UPDATE, percentChange: oldPrice === 0 ? 100 : ((manualFinalPrice - oldPrice) / oldPrice) * 100, changedBy: changedByUserId, notes: notes || 'Manual price override' } })
    ]);
    return this.getListing(id);
  }

  static async setApiPricingMode(id: string, changedBy: string = 'system', notes?: string) {
    const listing = await this.getListing(id);
    if (!listing) throw new NotFoundError('Listing not found');
    const calc = await PriceService.calculateFinalPrice({ referencePrice: listing.referencePrice, marginMultiplier: listing.marginMultiplier });
    const oldPrice = listing.finalPrice;
    const changedByUserId = await this.resolveChangedByUserId(changedBy);
    await prisma.$transaction([
      prisma.listing.update({ where: { id }, data: { finalPrice: calc.finalPrice, exchangeRate: calc.exchangeRate, status: 'active', lastSyncedAt: new Date() } }),
      prisma.priceHistory.create({ data: { listingId: id, oldPrice, newPrice: calc.finalPrice, oldReferencePrice: listing.referencePrice, newReferencePrice: listing.referencePrice, oldExchangeRate: listing.exchangeRate, newExchangeRate: calc.exchangeRate, reason: PriceUpdateReason.MANUAL_UPDATE, percentChange: oldPrice === 0 ? 100 : ((calc.finalPrice - oldPrice) / oldPrice) * 100, changedBy: changedByUserId, notes: notes || 'API pricing restored' } })
    ]);
    return this.getListing(id);
  }
}

export default ListingService;
