import prisma from '../utils/db.js';
import { PriceService } from './PriceService.js';
import { PriceUpdateReason } from '@prisma/client';
import { ScryfallService, YGOProDeckService, PokemonTCGService } from './CardDatabaseService.js';
import { TCGPlayerService } from './TCGPlayerService.js';

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
  /** When true (default for cron), tries to fetch latest market price from external APIs */
  fetchExternalPrices?: boolean;
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

/**
 * Attempt to fetch the latest market price for a card from external APIs.
 * Returns null if the card is not found or an error occurs.
 */
async function fetchExternalMarketPrice(
  cardCode: string,
  tcgName: string,
  rarity?: string,
  tcgplayerProductId?: number | null,
  tags?: string,
): Promise<number | null> {
  // Priority source: TCGplayer product pricing when a product id is available.
  const tagProductMatch = tags?.match(/tcgplayer(?:ProductId)?[:=](\d+)/i);
  const codeProductMatch = cardCode.match(/^\d+$/);
  const resolvedTcgplayerProductId =
    tcgplayerProductId ?? Number(tagProductMatch?.[1] || codeProductMatch?.[0]);

  if (Number.isFinite(resolvedTcgplayerProductId) && resolvedTcgplayerProductId > 0) {
    const tcgplayerPrice = await TCGPlayerService.getMarketPriceByProduct(resolvedTcgplayerProductId, rarity);
    if (tcgplayerPrice !== null) {
      return tcgplayerPrice;
    }
  }

  try {
    if (tcgName === 'MAGIC') {
      const card = await ScryfallService.getCardById(cardCode);
      return card?.priceMarket ?? card?.priceMid ?? null;
    }

    if (tcgName === 'POKEMON') {
      const card = await PokemonTCGService.getCardById(cardCode);
      return card?.priceMarket ?? card?.priceMid ?? null;
    }

    if (tcgName === 'YUGIOH') {
      const card = await YGOProDeckService.getCardById(cardCode);
      return card?.priceMarket ?? null;
    }
  } catch {
    // Fall through
  }
  return null;
}

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
      const shouldFetchExternal =
        input.fetchExternalPrices !== false && input.source === 'cron';

      if (!updates || updates.length === 0) {
        const listings = await prisma.listing.findMany({
          where: { status: 'active' },
          select: {
            id: true,
            referencePrice: true,
            marginMultiplier: true,
            card: {
              select: {
                cardCode: true,
                rarity: true,
                tags: true,
                tcgplayerProductId: true,
                tcg: { select: { name: true } },
              },
            },
          }
        });

        if (shouldFetchExternal) {
          // Build updates with fresh external prices where available
          updates = await Promise.all(
            listings.map(async (listing) => {
              const externalPrice = await fetchExternalMarketPrice(
                listing.card.cardCode,
                listing.card.tcg.name,
                listing.card.rarity ?? undefined,
                listing.card.tcgplayerProductId,
                listing.card.tags,
              ).catch(() => null);

              return {
                listingId: listing.id,
                referencePrice: externalPrice ?? listing.referencePrice,
                marginMultiplier: listing.marginMultiplier,
              };
            }),
          );
        } else {
          updates = listings.map((listing) => ({
            listingId: listing.id,
            referencePrice: listing.referencePrice,
            marginMultiplier: listing.marginMultiplier,
          }));
        }
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
