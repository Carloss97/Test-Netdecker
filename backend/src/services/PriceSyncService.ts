import prisma from '../utils/db.js';
import { CardCondition, PriceUpdateReason } from '@prisma/client';
import { DEFAULT_MARGIN_MULTIPLIER } from '../config/pricing.js';
import { ListingService } from './ListingService.js';
import { PriceService } from './PriceService.js';
import PriceApprovalService from './PriceApprovalService.js';
import PriceThresholdService from './PriceThresholdService.js';
import { CardDatabaseService } from './CardDatabaseService.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import createD1Proxy from '../utils/d1Proxy.js';

export interface PriceSyncUpdateInput {
  listingId?: string;
  cardId?: string;
  referencePrice: number;
  marginMultiplier?: number;
  source?: 'api' | 'stored' | 'fallback' | 'manual_input';
}

export interface RunPriceSyncInput {
  source: 'manual' | 'cron';
  updates?: PriceSyncUpdateInput[];
  notes?: string;
  changedBy?: string;
  roundingMultiple?: number;
  /** When true (default for cron), tries to fetch latest market price from external APIs */
  fetchExternalPrices?: boolean;
  /** When true, only include listings with stock in inventory. */
  inventoryOnly?: boolean;
  /** Optional manual sync filters */
  tcgName?: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';
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

type SyncTcgName = 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';

type SyncCardTarget = {
  id: string;
  cardCode: string;
  cardName: string;
  rarity: string;
  tcg: { name: SyncTcgName };
  edition: { id: string; editionCode: string };
  listings: Array<{
    id: string;
    status: string;
    referencePrice: number;
    marginMultiplier: number;
  }>;
};

type PriceSyncRunDelegate = {
  create: (args: unknown) => Promise<{ id: string }>;
  update: (args: unknown) => Promise<unknown>;
  findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
};

type ListingRow = {
  id: string;
  referencePrice: number;
  marginMultiplier: number;
  card: {
    cardCode: string;
    cardName: string;
    rarity?: string | null;
    tcg: { name: SyncTcgName };
    edition: { editionCode: string };
  };
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SET_SYNC_DELAY_MS: Record<SyncTcgName, number> = {
  MAGIC: 550,
  POKEMON: 120,
  YUGIOH: 60,
  ONE_PIECE: 350,
  DIGIMON: 200,
  WEISS_SCHWARZ: 200,
};

function normalizeSetCodeForTcg(tcgName: SyncTcgName, editionCode: string): string {
  if (tcgName === 'POKEMON') {
    return editionCode.toLowerCase();
  }
  return editionCode;
}

// NOTE: `fetchSetPriceLookup` removed — code now uses CardDatabaseService.getSetCards directly.

function estimateFallbackReferencePrice(tcgName: string, rarity?: string): number {
  const baseByTcg: Record<string, number> = {
    MAGIC: 0.5,
    POKEMON: 0.75,
    YUGIOH: 0.5,
    ONE_PIECE: 0.35,
    DIGIMON: 0.35,
    WEISS_SCHWARZ: 0.35,
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
    // If configured to use D1 backend, delegate to the D1 implementation
    if (process.env.USE_D1 === 'true') {
      const db = createD1Proxy(prisma);
      const priceSync = await import('../../../functions/_shared/priceSyncService.js');
      const res = await priceSync.runPriceSync(db, process.env, input as any);
      return {
        runId: res.runId,
        source: res.source,
        total: res.total,
        updated: res.updated,
        volatile: res.volatile,
        failed: res.failed,
        roundingMultiple: input.roundingMultiple ?? 1,
        errors: res.errors || [],
        pricingSourceStats: undefined,
        startedAt: res.startedAt,
        completedAt: res.completedAt,
      } as PriceSyncResult;
    }
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
      const inventoryOnly = input.inventoryOnly === true;
      let pricingSourceStats: { fromApi: number; fromStored: number; fromFallback: number } | undefined;

      if (!updates || updates.length === 0) {
        const where: {
          status: string;
          quantity?: { gt: number };
          editionId?: string;
          card?: { tcg: { name: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ' } };
        } = {
          status: 'active',
        };

        if (inventoryOnly) {
          where.quantity = { gt: 0 };
        }

        if (input.editionId) {
          where.editionId = input.editionId;
        }

        if (input.tcgName) {
          where.card = { tcg: { name: input.tcgName } };
        }

        let listings = await prisma.listing.findMany({
          where,
          select: {
            id: true,
            referencePrice: true,
            marginMultiplier: true,
            card: {
              select: {
                cardCode: true,
                cardName: true,
                rarity: true,
                tcg: { select: { name: true } },
                edition: { select: { editionCode: true } },
              },
            },
          }
        });

        if (inventoryOnly && listings.length === 0) {
          const relaxedWhere: typeof where = {
            status: 'active',
            ...(input.editionId ? { editionId: input.editionId } : {}),
            ...(input.tcgName ? { card: { tcg: { name: input.tcgName } } } : {}),
          };

          listings = await prisma.listing.findMany({
            where: relaxedWhere,
            select: {
              id: true,
              referencePrice: true,
              marginMultiplier: true,
              card: {
                select: {
                  cardCode: true,
                  cardName: true,
                  rarity: true,
                  tcg: { select: { name: true } },
                  edition: { select: { editionCode: true } },
                },
              },
            }
          });

          console.warn(
            '[PriceSyncService] inventoryOnly=true returned 0 listings. Falling back to all active listings for this sync run.',
          );
        }

        if (shouldFetchExternal) {
          let fromApi = 0;
          let fromStored = 0;
          let fromFallback = 0;

          const useSetSnapshotOptimization = true;

          if (!inventoryOnly) {
            const cards = await prisma.card.findMany({
              where: {
                ...(input.editionId ? { editionId: input.editionId } : {}),
                ...(input.tcgName ? { tcg: { name: input.tcgName } } : {}),
                edition: { isActive: true },
              },
              select: {
                id: true,
                cardCode: true,
                cardName: true,
                rarity: true,
                tcg: { select: { name: true } },
                edition: { select: { id: true, editionCode: true } },
                listings: {
                  select: {
                    id: true,
                    status: true,
                    referencePrice: true,
                    marginMultiplier: true,
                  },
                },
              },
            }) as SyncCardTarget[];

            if (cards.length > 0) {
              const grouped = new Map<string, SyncCardTarget[]>();

              for (const card of cards) {
                const tcgName = card.tcg.name as SyncTcgName;
                const editionCode = card.edition.editionCode;
                const key = `${tcgName}|${editionCode}`;
                if (!grouped.has(key)) {
                  grouped.set(key, []);
                }
                grouped.get(key)!.push(card);
              }

              const builtUpdates: PriceSyncUpdateInput[] = [];

              for (const [key, groupedCards] of grouped.entries()) {
                const [tcgNameRaw, editionCode] = key.split('|');
                const tcgName = tcgNameRaw as SyncTcgName;

                await sleep(SET_SYNC_DELAY_MS[tcgName] ?? 100);

                const setCards = await CardDatabaseService.getSetCards(
                  tcgName,
                  normalizeSetCodeForTcg(tcgName, editionCode),
                ).catch(() => []);

                const setPriceLookup = new Map<string, number>();
                const setPriceByName = new Map<string, number>();

                for (const card of setCards) {
                  const price = card.priceMarket ?? card.priceMid ?? card.priceLow;
                  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
                    continue;
                  }

                  setPriceLookup.set(card.externalId, price);

                  const nameKey = card.cardName.trim().toLowerCase();
                  const existingByName = setPriceByName.get(nameKey);
                  if (!existingByName || price > existingByName) {
                    setPriceByName.set(nameKey, price);
                  }
                }

                for (const card of groupedCards) {
                  const externalPrice =
                    setPriceLookup.get(card.cardCode) ??
                    setPriceByName.get(card.cardName.trim().toLowerCase()) ??
                    null;
                  const fallbackRef = estimateFallbackReferencePrice(
                    card.tcg.name,
                    card.rarity ?? undefined,
                  );
                  const activeListings = card.listings.filter((listing) => listing.status === 'active');

                  if (activeListings.length > 0) {
                    for (const listing of activeListings) {
                      const safeStoredRef = listing.referencePrice > 0 ? listing.referencePrice : null;

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
                        source: externalPrice && externalPrice > 0
                          ? 'api'
                          : safeStoredRef
                            ? 'stored'
                            : 'fallback',
                      });
                    }
                    continue;
                  }

                  if (card.listings.length > 0) {
                    continue;
                  }

                  const chosenReference = externalPrice && externalPrice > 0 ? externalPrice : fallbackRef;
                  if (externalPrice && externalPrice > 0) {
                    fromApi += 1;
                  } else {
                    fromFallback += 1;
                  }

                  builtUpdates.push({
                    cardId: card.id,
                    referencePrice: chosenReference,
                    marginMultiplier: DEFAULT_MARGIN_MULTIPLIER,
                    source: externalPrice && externalPrice > 0 ? 'api' : 'fallback',
                  });
                }

                updates = builtUpdates;
                console.info(`[PriceSyncService] Set-snapshot optimization used: ${grouped.size} set calls for ${cards.length} imported cards`);
              }
            }
          }

          if ((!updates || updates.length === 0) && useSetSnapshotOptimization) {
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

              const setCards = await CardDatabaseService.getSetCards(
                tcgName,
                normalizeSetCodeForTcg(tcgName, editionCode),
              ).catch(() => []);

              const setPriceLookup = new Map<string, number>();
              const setPriceByName = new Map<string, number>();

              for (const card of setCards) {
                const price = card.priceMarket ?? card.priceMid ?? card.priceLow;
                if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
                  continue;
                }

                setPriceLookup.set(card.externalId, price);

                const nameKey = card.cardName.trim().toLowerCase();
                const existingByName = setPriceByName.get(nameKey);
                if (!existingByName || price > existingByName) {
                  setPriceByName.set(nameKey, price);
                }
              }

              for (const listing of groupedListings) {
                const externalPrice =
                  setPriceLookup.get(listing.card.cardCode) ??
                  setPriceByName.get(listing.card.cardName.trim().toLowerCase()) ??
                  null;
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
                  source: externalPrice && externalPrice > 0
                    ? 'api'
                    : safeStoredRef
                      ? 'stored'
                      : 'fallback',
                });
              }
            }

            updates = builtUpdates;
            console.info(`[PriceSyncService] Set-snapshot optimization used: ${grouped.size} set calls for ${listings.length} listings`);
          }

          pricingSourceStats = { fromApi, fromStored, fromFallback };
          const effectiveUpdates = updates ?? [];
          const resolvedFromApi = effectiveUpdates.filter((u) => u.referencePrice > 0).length;
          console.info(`[PriceSyncService] External pricing resolved for ${resolvedFromApi}/${effectiveUpdates.length} listings`);
          console.info(`[PriceSyncService] Price source stats: API=${fromApi}, stored=${fromStored}, fallback=${fromFallback}`);
        } else {
          updates = listings.map((listing: ListingRow) => ({
            listingId: listing.id,
            referencePrice: listing.referencePrice,
            marginMultiplier: listing.marginMultiplier,
            source: 'stored',
          }));
        }
      }

      if (updates && updates.length > 0) {
        updates = updates.map((u: PriceSyncUpdateInput) => ({
          ...u,
          source: u.source ?? 'manual_input',
        }));
      }

      const effectiveUpdates = updates ?? [];

      result.total = effectiveUpdates.length;

      for (const update of effectiveUpdates) {
        try {
          if (update.listingId) {
            const listing = await prisma.listing.findUnique({
              where: { id: update.listingId },
              select: {
                id: true,
                finalPrice: true,
                marginMultiplier: true,
                editionId: true,
                card: { select: { tcg: { select: { name: true } } } },
              }
            });

            if (!listing) {
              throw new NotFoundError('Listing not found');
            }

            const resolvedMargin = update.marginMultiplier || listing.marginMultiplier;

            const calculated = await PriceService.calculateFinalPrice({
              referencePrice: update.referencePrice,
              marginMultiplier: resolvedMargin,
              roundingMultiple: resolvedRounding,
            });

            const isApiSourced = update.source === 'api';
            const threshold = await PriceThresholdService.getThreshold(
              (listing.card as any)?.tcg?.name ?? null,
              listing.editionId ?? null,
            );

            const isVolatile = isApiSourced && listing.finalPrice > 0
              ? await PriceService.isVolatileChange(listing.finalPrice, calculated.finalPrice, threshold)
              : false;

            // If manual approval is required for volatile changes, create an approval
            // record and skip applying the update automatically.
            const approvalRequired = process.env.PRICE_APPROVAL_REQUIRED === 'true';
            if (isVolatile && approvalRequired) {
              const percentChange = listing.finalPrice === 0
                ? (calculated.finalPrice > 0 ? 100 : 0)
                : ((calculated.finalPrice - listing.finalPrice) / listing.finalPrice) * 100;

              await PriceApprovalService.createApproval({
                listingId: listing.id,
                oldFinalPrice: listing.finalPrice,
                newFinalPrice: calculated.finalPrice,
                newReferencePrice: update.referencePrice,
                marginMultiplier: resolvedMargin,
                percentChange,
                requestedBy: input.changedBy || input.source,
                notes: input.notes ?? (input.source === 'cron' ? 'Scheduled price sync (pending approval)' : 'Manual price sync (pending approval)'),
              });

              result.volatile += 1;
              continue;
            }

            if (isVolatile) {
              result.volatile += 1;
            }

            const reason = isVolatile
              ? PriceUpdateReason.VOLATILE_ALERT
              : isApiSourced
                ? PriceUpdateReason.EXTERNAL_API_SYNC
                : PriceUpdateReason.TCGPLAYER_SYNC;

            await PriceService.updateListingPrice(
              update.listingId,
              update.referencePrice,
              resolvedMargin,
              reason,
              input.changedBy || input.source,
              input.notes || (input.source === 'cron' ? 'Scheduled price sync' : 'Manual price sync'),
              resolvedRounding,
            );

            result.updated += 1;
            continue;
          }

          if (update.cardId) {
            const resolvedMargin = update.marginMultiplier || DEFAULT_MARGIN_MULTIPLIER;
            const createdListing = await ListingService.createListing({
              cardId: update.cardId,
              condition: CardCondition.NM,
              quantity: 0,
              referencePrice: update.referencePrice,
              marginMultiplier: resolvedMargin,
            });

            await prisma.listing.update({
              where: { id: createdListing.id },
              data: { lastSyncedAt: new Date() },
            });

            result.updated += 1;
            continue;
          }

          throw new ValidationError('Sync target missing listingId or cardId');
        } catch (error: unknown) {
          result.failed += 1;
          result.errors.push({
            listingId: update.listingId || update.cardId || 'N/A',
            message: error instanceof Error ? error.message : String(error),
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
