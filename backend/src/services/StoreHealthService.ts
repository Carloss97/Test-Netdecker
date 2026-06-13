import prisma from '../utils/db.js';

export interface StoreOperationalHealthOptions {
  stalePriceDays?: number;
  lowStockThreshold?: number;
}

export interface StoreOperationalHealth {
  storeId?: string;
  generatedAt: string;
  healthScore: number;
  inventory: {
    totalListings: number;
    activeListings: number;
    lowStockListings: number;
    outOfStockListings: number;
    totalValueCLP: number;
    lowStockThreshold: number;
  };
  pricing: {
    stalePriceListings: number;
    missingReferencePriceListings: number;
    stalePriceDays: number;
  };
  sync: {
    lastSuccessfulSyncAt: string | null;
    recentFailedRuns: Array<{
      id: string;
      status: string;
      failed: number;
      errors: unknown[];
      completedAt: string | null;
    }>;
  };
}

function parseErrors(errors: unknown): unknown[] {
  if (!errors) return [];
  if (Array.isArray(errors)) return errors;
  if (typeof errors !== 'string') return [];

  try {
    const parsed = JSON.parse(errors);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function calculateHealthScore(input: {
  totalListings: number;
  lowStockListings: number;
  outOfStockListings: number;
  stalePriceListings: number;
  missingReferencePriceListings: number;
  failedRuns: number;
}): number {
  const total = Math.max(input.totalListings, 1);
  const stockPenalty = ((input.lowStockListings * 3) + (input.outOfStockListings * 6)) / total;
  const pricePenalty = ((input.stalePriceListings * 4) + (input.missingReferencePriceListings * 5)) / total;
  const syncPenalty = Math.min(input.failedRuns * 8, 24);
  return Math.max(0, Math.round(100 - stockPenalty - pricePenalty - syncPenalty));
}

export class StoreHealthService {
  static async getOperationalHealth(
    storeId?: string,
    options: StoreOperationalHealthOptions = {},
  ): Promise<StoreOperationalHealth> {
    const stalePriceDays = Math.max(1, Math.round(options.stalePriceDays ?? 7));
    const lowStockThreshold = Math.max(1, Math.round(options.lowStockThreshold ?? 5));
    const listingScope = storeId ? { storeId } : {};
    const activeScope = { status: { in: ['active', 'manual'] as const }, ...listingScope };
    const staleBefore = new Date(Date.now() - stalePriceDays * 24 * 60 * 60 * 1000);

    const [
      totalListings,
      activeListings,
      lowStockListings,
      outOfStockListings,
      stalePriceListings,
      missingReferencePriceListings,
      inventoryRows,
      recentFailedRunsRaw,
      lastSuccessfulRun,
    ] = await Promise.all([
      prisma.listing.count({ where: listingScope }),
      prisma.listing.count({ where: activeScope }),
      prisma.listing.count({ where: { ...activeScope, quantity: { gt: 0, lte: lowStockThreshold } } }),
      prisma.listing.count({ where: { ...activeScope, quantity: { lte: 0 }, everHadStock: true } }),
      prisma.listing.count({
        where: {
          ...activeScope,
          OR: [
            { lastSyncedAt: null },
            { lastSyncedAt: { lt: staleBefore } },
          ],
        },
      }),
      prisma.listing.count({
        where: {
          ...activeScope,
          OR: [
            { referencePrice: { lte: 0 } },
            { finalPrice: { lte: 0 } },
          ],
        },
      }),
      prisma.listing.findMany({
        where: { ...activeScope, quantity: { gt: 0 } },
        select: { id: true, quantity: true, finalPrice: true },
      }),
      (prisma as any).priceSyncRun?.findMany
        ? (prisma as any).priceSyncRun.findMany({
            where: { ...(storeId ? { storeId } : {}), status: 'failed' },
            orderBy: { startedAt: 'desc' },
            take: 3,
          })
        : Promise.resolve([]),
      (prisma as any).priceSyncRun?.findFirst
        ? (prisma as any).priceSyncRun.findFirst({
            where: { ...(storeId ? { storeId } : {}), status: 'completed' },
            orderBy: { completedAt: 'desc' },
          })
        : Promise.resolve(null),
    ]);

    const totalValueCLP = (inventoryRows as Array<{ quantity: number; finalPrice: number }>).reduce(
      (sum, listing) => sum + (Number(listing.quantity || 0) * Number(listing.finalPrice || 0)),
      0,
    );

    const recentFailedRuns = (Array.isArray(recentFailedRunsRaw) ? recentFailedRunsRaw : []).map((run: any) => ({
      id: String(run.id),
      status: String(run.status || 'failed'),
      failed: Number(run.failed || 0),
      errors: parseErrors(run.errors),
      completedAt: toIso(run.completedAt),
    }));

    return {
      storeId,
      generatedAt: new Date().toISOString(),
      healthScore: calculateHealthScore({
        totalListings,
        lowStockListings,
        outOfStockListings,
        stalePriceListings,
        missingReferencePriceListings,
        failedRuns: recentFailedRuns.length,
      }),
      inventory: {
        totalListings,
        activeListings,
        lowStockListings,
        outOfStockListings,
        totalValueCLP,
        lowStockThreshold,
      },
      pricing: {
        stalePriceListings,
        missingReferencePriceListings,
        stalePriceDays,
      },
      sync: {
        lastSuccessfulSyncAt: toIso((lastSuccessfulRun as any)?.completedAt),
        recentFailedRuns,
      },
    };
  }
}
