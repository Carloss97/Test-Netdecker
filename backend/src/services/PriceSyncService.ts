import prisma from '../utils/db.js';
import { PriceService } from './PriceService.js';
import { PriceUpdateReason } from '@prisma/client';
import { CardDatabaseService, ScryfallService, YGOProDeckService, PokemonTCGService, OptcgapiService } from './CardDatabaseService.js';

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
  /** Optional manual sync filters */
  tcgName?: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE';
  editionId?: string;
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
  pricingSourceStats?: {
    fromApi: number;
    fromStored: number;
    fromFallback: number;
  };
  startedAt: string;
  completedAt: string;
}

type SyncTcgName = 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE';

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
): Promise<number | null> {
  try {
    // Each TCG uses its native API for pricing

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

    if (tcgName === 'ONE_PIECE') {
      const card = await OptcgapiService.getCardById(cardCode);
      return card?.priceMarket ?? null;
    }
  } catch {
    // Fall through to return null
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SET_SYNC_DELAY_MS: Record<SyncTcgName, number> = {
  MAGIC: 550,
  POKEMON: 120,
  YUGIOH: 60,
  ONE_PIECE: 350,
};

function normalizeSetCodeForTcg(tcgName: SyncTcgName, editionCode: string): string {
  if (tcgName === 'POKEMON') {
    return editionCode.toLowerCase();
  }
  return editionCode;
}

async function fetchSetPriceLookup(
  tcgName: SyncTcgName,
  editionCode: string,
): Promise<Map<string, number>> {
  const normalizedEditionCode = normalizeSetCodeForTcg(tcgName, editionCode);
  const cards = await CardDatabaseService.getSetCards(tcgName, normalizedEditionCode);
  const lookup = new Map<string, number>();

  for (const card of cards) {
    const price = card.priceMarket ?? card.priceMid ?? card.priceLow;
    if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
      lookup.set(card.externalId, price);
    }
  }

  return lookup;
}

function estimateFallbackReferencePrice(tcgName: string, rarity?: string): number {
  const baseByTcg: Record<string, number> = {
    MAGIC: 0.5,
    POKEMON: 0.75,
    YUGIOH: 0.5,
    ONE_PIECE: 0.35,
  };
  const base = baseByTcg[tcgName] ?? 0.5;
  const r = (rarity || '').toLowerCase();

  let multiplier = 0.75;
  if (r.includes('mythic') || r.includes('secret') || r.includes('ultimate') || r.includes('legendary')) {
    multiplier = 3;
  } else if (r.includes('ultra') || r.includes('gold') || r.includes('rainbow') || r.includes('alt')) {
    multiplier = 2;
  } else if (r.includes('super') || r.includes('hyper') || r === 'sr' || r === 'ur') {
    multiplier = 1.5;
  } else if (r.includes('rare') || r.includes('holo') || r.includes('parallel')) {
    multiplier = 1.2;
  } else if (r.includes('uncommon')) {
    multiplier = 1;
  }

  return Number((base * multiplier).toFixed(2));
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
      const shouldFetchExternal = input.fetchExternalPrices !== false;
      let pricingSourceStats: { fromApi: number; fromStored: number; fromFallback: number } | undefined;

      if (!updates || updates.length === 0) {
        const where: {
          status: string;
          editionId?: string;
          card?: { tcg: { name: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' } };
        } = {
          status: 'active',
        };

        if (input.editionId) {
          where.editionId = input.editionId;
        }

        if (input.tcgName) {
          where.card = { tcg: { name: input.tcgName } };
        }

        const listings = await prisma.listing.findMany({
          where,
          select: {
            id: true,
            referencePrice: true,
            marginMultiplier: true,
            card: {
              select: {
                cardCode: true,
                rarity: true,
                tcg: { select: { name: true } },
                edition: { select: { editionCode: true } },
              },
            },
          }
        });

        if (shouldFetchExternal) {
          let fromApi = 0;
          let fromStored = 0;
          let fromFallback = 0;

          const useSetSnapshotOptimization = Boolean(input.editionId || input.tcgName);

          if (useSetSnapshotOptimization) {
            const grouped = new Map<string, typeof listings>();
            for (const listing of listings) {
              const tcgName = listing.card.tcg.name as SyncTcgName;
              const editionCode = listing.card.edition.editionCode;
              const key = `${tcgName}|${editionCode}`;
              if (!grouped.has(key)) {
                grouped.set(key, []);
              }
              grouped.get(key)!.push(listing);
            }

            const builtUpdates: PriceSyncUpdateInput[] = [];

            for (const [key, groupedListings] of grouped.entries()) {
              const [tcgNameRaw, editionCode] = key.split('|');
              const tcgName = tcgNameRaw as SyncTcgName;

              // Respect provider-specific limits by spacing set-level calls.
              await sleep(SET_SYNC_DELAY_MS[tcgName] ?? 100);

              const setPriceLookup = await fetchSetPriceLookup(tcgName, editionCode).catch(() => new Map<string, number>());

              for (const listing of groupedListings) {
                const externalPrice = setPriceLookup.get(listing.card.cardCode) ?? null;
                const safeStoredRef = listing.referencePrice > 0 ? listing.referencePrice : null;
                const fallbackRef = estimateFallbackReferencePrice(
                  listing.card.tcg.name,
                  listing.card.rarity ?? undefined,
                );

                let chosenReference = fallbackRef;
                if (externalPrice && externalPrice > 0) {
                  chosenReference = externalPrice;
                  fromApi += 1;
                } else if (safeStoredRef) {
                  chosenReference = safeStoredRef;
                  fromStored += 1;
                } else {
                  fromFallback += 1;
                }

                builtUpdates.push({
                  listingId: listing.id,
                  referencePrice: chosenReference,
                  marginMultiplier: listing.marginMultiplier,
                });
              }
            }

            updates = builtUpdates;
            console.info(`[PriceSyncService] Set-snapshot optimization used: ${grouped.size} set calls for ${listings.length} listings`);
          } else {
            // Build updates with per-card external prices for full/global sync.
            updates = await Promise.all(
              listings.map(async (listing) => {
                const externalPrice = await fetchExternalMarketPrice(
                  listing.card.cardCode,
                  listing.card.tcg.name,
                  listing.card.rarity ?? undefined,
                ).catch(() => null);

                const safeStoredRef = listing.referencePrice > 0 ? listing.referencePrice : null;
                const fallbackRef = estimateFallbackReferencePrice(
                  listing.card.tcg.name,
                  listing.card.rarity ?? undefined,
                );

                let chosenReference = fallbackRef;
                if (externalPrice && externalPrice > 0) {
                  chosenReference = externalPrice;
                  fromApi += 1;
                } else if (safeStoredRef) {
                  chosenReference = safeStoredRef;
                  fromStored += 1;
                } else {
                  fromFallback += 1;
                }

                return {
                  listingId: listing.id,
                  referencePrice: chosenReference,
                  marginMultiplier: listing.marginMultiplier,
                };
              }),
            );
          }

          pricingSourceStats = { fromApi, fromStored, fromFallback };
          const resolvedFromApi = updates.filter((u) => u.referencePrice > 0).length;
          console.info(`[PriceSyncService] External pricing resolved for ${resolvedFromApi}/${updates.length} listings`);
          console.info(`[PriceSyncService] Price source stats: API=${fromApi}, stored=${fromStored}, fallback=${fromFallback}`);
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
        pricingSourceStats,
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
