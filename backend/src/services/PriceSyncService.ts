import prisma from '../utils/db.js';
import { PriceService } from './PriceService.js';
import { PriceUpdateReason } from '@prisma/client';

export interface PriceSyncUpdateInput {
  listingId: string;
  referencePrice: number;
  marginMultiplier?: number;
}

export interface RunPriceSyncInput {
  source: 'manual' | 'cron';
  updates?: PriceSyncUpdateInput[];
  notes?: string;
  changedBy?: string;
  roundingMultiple?: number;
}

export interface PriceSyncResult {
  runId: string;
  source: 'manual' | 'cron';
  total: number;
  updated: number;
  volatile: number;
  failed: number;
  roundingMultiple: number;
  errors: Array<{ listingId: string; message: string }>;
  startedAt: string;
  completedAt: string;
}

type PriceSyncRunDelegate = {
  create: (args: unknown) => Promise<{ id: string }>;
  update: (args: unknown) => Promise<unknown>;
  findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
};

const getPriceSyncRunDelegate = (): PriceSyncRunDelegate | null => {
  const candidate = (prisma as unknown as Record<string, unknown>)['priceSyncRun'];
  if (!candidate) {
    return null;
  }
  return candidate as PriceSyncRunDelegate;
};

const parseRunErrors = (errors: string | null) => {
  if (!errors) return [] as Array<{ listingId: string; message: string }>;
  try {
    const parsed = JSON.parse(errors);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export class PriceSyncService {
  static async runPriceSync(input: RunPriceSyncInput): Promise<PriceSyncResult> {
    const startedAt = new Date();
    const resolvedRounding = PriceService.resolveRoundingMultiple(input.roundingMultiple);
    const runDelegate = getPriceSyncRunDelegate();

    if (!runDelegate) {
      console.warn('[PriceSyncService] priceSyncRun delegate not available. Running without persistent run trace.');
    }

    const ephemeralRunId = `ephemeral-${Date.now()}`;
    const run = runDelegate
      ? await runDelegate.create({
          data: {
            source: input.source,
            status: 'running',
            notes: input.notes,
            startedAt,
            roundingMultiple: resolvedRounding,
          }
        })
      : { id: ephemeralRunId };

    const result = {
      total: 0,
      updated: 0,
      volatile: 0,
      failed: 0,
      errors: [] as Array<{ listingId: string; message: string }>,
    };

    try {
      let updates = input.updates;

      if (!updates || updates.length === 0) {
        const listings = await prisma.listing.findMany({
          where: { status: 'active' },
          select: {
            id: true,
            referencePrice: true,
            marginMultiplier: true,
          }
        });

        updates = listings.map((listing) => ({
          listingId: listing.id,
          referencePrice: listing.referencePrice,
          marginMultiplier: listing.marginMultiplier,
        }));
      }

      result.total = updates.length;

      for (const update of updates) {
        try {
          const listing = await prisma.listing.findUnique({
            where: { id: update.listingId },
            select: {
              id: true,
              finalPrice: true,
              marginMultiplier: true,
            }
          });

          if (!listing) {
            throw new Error('Listing not found');
          }

          const resolvedMargin = update.marginMultiplier || listing.marginMultiplier;

          const calculated = await PriceService.calculateFinalPrice({
            referencePrice: update.referencePrice,
            marginMultiplier: resolvedMargin,
            roundingMultiple: resolvedRounding,
          });

          const isVolatile = PriceService.isVolatileChange(listing.finalPrice, calculated.finalPrice);
          if (isVolatile) {
            result.volatile += 1;
          }

          await PriceService.updateListingPrice(
            update.listingId,
            update.referencePrice,
            resolvedMargin,
            isVolatile ? PriceUpdateReason.VOLATILE_ALERT : PriceUpdateReason.TCGPLAYER_SYNC,
            input.changedBy || input.source,
            input.notes || (input.source === 'cron' ? 'Scheduled price sync' : 'Manual price sync'),
            resolvedRounding,
          );

          result.updated += 1;
        } catch (error) {
          result.failed += 1;
          result.errors.push({
            listingId: update.listingId,
            message: (error as Error).message,
          });
        }
      }

      const completedAt = new Date();

      if (runDelegate) {
        await runDelegate.update({
          where: { id: run.id },
          data: {
            status: result.failed > 0 && result.updated === 0 ? 'failed' : 'completed',
            total: result.total,
            updated: result.updated,
            volatile: result.volatile,
            failed: result.failed,
            errors: result.errors.length ? JSON.stringify(result.errors) : null,
            completedAt,
          }
        });
      }

      return {
        runId: run.id,
        source: input.source,
        total: result.total,
        updated: result.updated,
        volatile: result.volatile,
        failed: result.failed,
        roundingMultiple: resolvedRounding,
        errors: result.errors,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
      };
    } catch (error) {
      const completedAt = new Date();

      if (runDelegate) {
        await runDelegate.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            total: result.total,
            updated: result.updated,
            volatile: result.volatile,
            failed: result.failed || 1,
            errors: JSON.stringify([
              ...result.errors,
              {
                listingId: 'N/A',
                message: (error as Error).message,
              }
            ]),
            completedAt,
          }
        });
      }

      throw error;
    }
  }

  static async getRecentRuns(limit: number = 20) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const runDelegate = getPriceSyncRunDelegate();

    if (!runDelegate) {
      return [];
    }

    const runs = await runDelegate.findMany({
      orderBy: { startedAt: 'desc' },
      take: safeLimit,
    });

    return runs.map((run: Record<string, unknown>) => ({
      ...run,
      parsedErrors: parseRunErrors((run.errors as string | null) || null),
    }));
  }

  static async getRunById(runId: string) {
    const runDelegate = getPriceSyncRunDelegate();
    if (!runDelegate) {
      return null;
    }

    const run = await runDelegate.findUnique({ where: { id: runId } });
    if (!run) return null;

    return {
      ...run,
      parsedErrors: parseRunErrors((run.errors as string | null) || null),
    };
  }
}
