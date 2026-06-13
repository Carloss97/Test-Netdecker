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
import * as PriceSyncD1 from '../functions/_shared/priceSyncService.js';

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
  fetchExternalPrices?: boolean;
  inventoryOnly?: boolean;
  storeId?: string;
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
  create: (args: any) => Promise<{ id: string }>;
  update: (args: any) => Promise<any>;
  findMany: (args: any) => Promise<any[]>;
  findUnique: (args: any) => Promise<any | null>;
  findFirst?: (args: any) => Promise<any | null>;
};

const getPriceSyncRunDelegate = (): PriceSyncRunDelegate | null => {
  const candidate = (prisma as any)['priceSyncRun'];
  if (!candidate) return null;
  return candidate as PriceSyncRunDelegate;
};

const parseRunErrors = (errors: string | null) => {
  if (!errors) return [];
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
  if (tcgName === 'POKEMON') return editionCode.toLowerCase();
  return editionCode;
}

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
  if (r.includes('mythic') || r.includes('secret') || r.includes('ultimate') || r.includes('legendary')) multiplier = 3;
  else if (r.includes('ultra') || r.includes('gold') || r.includes('rainbow') || r.includes('alt')) multiplier = 2;
  else if (r.includes('super') || r.includes('hyper') || r === 'sr' || r === 'ur') multiplier = 1.5;
  else if (r.includes('rare') || r.includes('holo') || r.includes('parallel')) multiplier = 1.2;
  else if (r.includes('uncommon')) multiplier = 1;

  return Number((base * multiplier).toFixed(2));
}

export class PriceSyncService {
  /**
   * Processes a single price update, handling volatility checks and approval records.
   */
  private static async processOne(
    update: PriceSyncUpdateInput, 
    resolvedRounding: number, 
    input: RunPriceSyncInput, 
    result: any,
    db: any = prisma
  ) {
    if (update.listingId) {
      const listing = await db.listing.findUnique({
        where: { id: update.listingId },
        select: {
          id: true,
          finalPrice: true,
          marginMultiplier: true,
          editionId: true,
          card: { select: { tcg: { select: { name: true } } } },
        }
      });

      if (!listing) throw new NotFoundError('Listing not found');

      const resolvedMargin = update.marginMultiplier || (listing as any).marginMultiplier;
      const calculated = await PriceService.calculateFinalPrice({
        referencePrice: update.referencePrice,
        marginMultiplier: resolvedMargin,
        roundingMultiple: resolvedRounding,
      });

      const isApiSourced = update.source === 'api';
      const threshold = await PriceThresholdService.getThreshold(
        (listing as any).card?.tcg?.name ?? null,
        (listing as any).editionId ?? null,
      );

      const isVolatile = isApiSourced && (listing as any).finalPrice > 0
        ? await PriceService.isVolatileChange((listing as any).finalPrice, calculated.finalPrice, threshold)
        : false;

      const approvalRequired = process.env.PRICE_APPROVAL_REQUIRED === 'true';
      if (isVolatile && approvalRequired) {
        const percentChange = (listing as any).finalPrice === 0
          ? (calculated.finalPrice > 0 ? 100 : 0)
          : ((calculated.finalPrice - (listing as any).finalPrice) / (listing as any).finalPrice) * 100;

        await PriceApprovalService.createApproval({
          listingId: (listing as any).id,
          oldFinalPrice: (listing as any).finalPrice,
          newFinalPrice: calculated.finalPrice,
          newReferencePrice: update.referencePrice,
          marginMultiplier: resolvedMargin,
          percentChange,
          requestedBy: input.changedBy || input.source,
          notes: input.notes ?? (input.source === 'cron' ? 'Scheduled price sync (pending approval)' : 'Manual price sync (pending approval)'),
        });

        result.volatile += 1;
        return;
      }

      const reason = isVolatile ? PriceUpdateReason.VOLATILE_ALERT : isApiSourced ? PriceUpdateReason.EXTERNAL_API_SYNC : PriceUpdateReason.TCGPLAYER_SYNC;

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
      return;
    }

    if (update.cardId) {
      const defaultStore = input.storeId
        ? { id: input.storeId }
        : await db.store.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } });
      if (!defaultStore) throw new NotFoundError('No store available to create listing during sync');

      const resolvedMargin = update.marginMultiplier || DEFAULT_MARGIN_MULTIPLIER;
      const createdListing = await ListingService.createListing({
        storeId: defaultStore.id,
        cardId: update.cardId,
        condition: CardCondition.NM,
        quantity: 0,
        referencePrice: update.referencePrice,
        marginMultiplier: resolvedMargin,
      });

      await db.listing.update({ where: { id: createdListing.id }, data: { lastSyncedAt: new Date() } });
      result.updated += 1;
      return;
    }

    throw new ValidationError('Sync target missing listingId or cardId');
  }

  static async runPriceSync(input: RunPriceSyncInput): Promise<PriceSyncResult> {
    if (process.env.USE_D1 === 'true') {
      const db = createD1Proxy(prisma);
      const res = await (PriceSyncD1 as any).runPriceSync(db, process.env, input as any);
      return {
        runId: res.runId,
        source: res.source,
        total: res.total,
        updated: res.updated,
        volatile: res.volatile,
        failed: res.failed,
        roundingMultiple: input.roundingMultiple ?? 1,
        errors: res.errors || [],
        startedAt: res.startedAt,
        completedAt: res.completedAt,
      } as PriceSyncResult;
    }

    const startedAt = new Date();
    const resolvedRounding = PriceService.resolveRoundingMultiple(input.roundingMultiple);
    const runDelegate = getPriceSyncRunDelegate();
    const ephemeralRunId = `ephemeral-${Date.now()}`;
    const run = runDelegate ? await runDelegate.create({ data: { storeId: input.storeId, source: input.source, status: 'running', notes: input.notes, startedAt, roundingMultiple: resolvedRounding } }) : { id: ephemeralRunId };

    const result = { total: 0, updated: 0, volatile: 0, failed: 0, errors: [] as any[] };

    try {
      let updates = input.updates;
      const shouldFetchExternal = input.fetchExternalPrices !== false;
      const inventoryOnly = input.inventoryOnly === true;
      let pricingSourceStats;

      if (!updates || updates.length === 0) {
        const where: any = { status: 'active' };
        if (input.storeId) where.storeId = input.storeId;
        if (inventoryOnly) where.quantity = { gt: 0 };
        if (input.editionId) where.editionId = input.editionId;
        if (input.tcgName) where.card = { tcg: { name: input.tcgName } };

        let listings = await prisma.listing.findMany({
          where,
          select: {
            id: true,
            referencePrice: true,
            marginMultiplier: true,
            card: { select: { cardCode: true, cardName: true, rarity: true, tcg: { select: { name: true } }, edition: { select: { editionCode: true } } } }
          }
        });

        if (shouldFetchExternal) {
          let fromApi = 0, fromStored = 0, fromFallback = 0;
          const grouped = new Map<string, any[]>();
          for (const listing of listings) {
            const key = `${listing.card.tcg.name}|${listing.card.edition.editionCode}`;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key)!.push(listing);
          }

          const builtUpdates: PriceSyncUpdateInput[] = [];
          for (const [key, groupedListings] of grouped.entries()) {
            const [tcgNameRaw, editionCode] = key.split('|');
            const tcgName = tcgNameRaw as SyncTcgName;
            await sleep(SET_SYNC_DELAY_MS[tcgName] ?? 100);

            const setPriceSnapshot = await CardDatabaseService.getSetPriceSnapshot(tcgName, normalizeSetCodeForTcg(tcgName, editionCode)).catch(() => ({}));

            for (const listing of groupedListings) {
              const normalizedCode = String(listing.card.cardCode || '').trim();
              const externalPrice = (setPriceSnapshot as any)[normalizedCode] ?? null;
              const safeStoredRef = listing.referencePrice > 0 ? listing.referencePrice : null;
              const fallbackRef = estimateFallbackReferencePrice(listing.card.tcg.name, listing.card.rarity);

              let chosenReference = fallbackRef;
              let source: any = 'fallback';
              if (externalPrice && externalPrice > 0) { chosenReference = externalPrice; fromApi++; source = 'api'; }
              else if (safeStoredRef) { chosenReference = safeStoredRef; fromStored++; source = 'stored'; }
              else { fromFallback++; }

              builtUpdates.push({ listingId: listing.id, referencePrice: chosenReference, marginMultiplier: listing.marginMultiplier, source });
            }
          }
          updates = builtUpdates;
          pricingSourceStats = { fromApi, fromStored, fromFallback };
        } else {
          updates = listings.map((l: any) => ({ listingId: l.id, referencePrice: l.referencePrice, marginMultiplier: l.marginMultiplier, source: 'stored' }));
        }
      }

      const effectiveUpdates = (updates || []).map(u => ({ ...u, source: u.source ?? 'manual_input' }));
      result.total = effectiveUpdates.length;

      const volatileUpdates: any[] = [];
      const directUpdates: any[] = [];
      const BATCH_SIZE = 100;

      for (let i = 0; i < effectiveUpdates.length; i += BATCH_SIZE) {
        const chunk = effectiveUpdates.slice(i, i + BATCH_SIZE);
        const listingIds = chunk.map(u => u.listingId).filter(Boolean) as string[];
        const currentListingWhere: any = { id: { in: listingIds } };
        if (input.storeId) currentListingWhere.storeId = input.storeId;
        const currentListings = await prisma.listing.findMany({
          where: currentListingWhere,
          select: { id: true, finalPrice: true, marginMultiplier: true, editionId: true, card: { select: { tcg: { select: { name: true } } } } }
        });
        const currentMap = new Map(currentListings.map(l => [l.id, l]));

        for (const update of chunk) {
          if (!update.listingId) { directUpdates.push(update); continue; }
          const listing = currentMap.get(update.listingId);
          if (!listing) { result.failed++; continue; }

          const resolvedMargin = update.marginMultiplier || (listing as any).marginMultiplier;
          const calculated = await PriceService.calculateFinalPrice({ referencePrice: update.referencePrice, marginMultiplier: resolvedMargin, roundingMultiple: resolvedRounding });
          const threshold = await PriceThresholdService.getThreshold((listing as any).card?.tcg?.name ?? null, (listing as any).editionId ?? null);
          const isVolatile = (update.source === 'api' && (listing as any).finalPrice > 0) ? await PriceService.isVolatileChange((listing as any).finalPrice, calculated.finalPrice, threshold) : false;

          if (isVolatile && process.env.PRICE_APPROVAL_REQUIRED === 'true') {
            volatileUpdates.push({ ...update, marginMultiplier: resolvedMargin });
          } else {
            directUpdates.push({ ...update, marginMultiplier: resolvedMargin });
            if (isVolatile) result.volatile++;
          }
        }
      }

      for (const update of volatileUpdates) {
        try { await this.processOne(update, resolvedRounding, input, result); } 
        catch (err: any) { result.failed++; result.errors.push({ listingId: update.listingId, message: err.message }); }
      }

      const UPDATE_BATCH_SIZE = 200;
      for (let i = 0; i < directUpdates.length; i += UPDATE_BATCH_SIZE) {
        const chunk = directUpdates.slice(i, i + UPDATE_BATCH_SIZE);
        await prisma.$transaction(async (tx) => {
          for (const update of chunk) {
            try {
              if (update.listingId) {
                const calculated = await PriceService.calculateFinalPrice({ referencePrice: update.referencePrice, marginMultiplier: update.marginMultiplier!, roundingMultiple: resolvedRounding });
                await tx.listing.update({
                  where: { id: update.listingId },
                  data: { referencePrice: update.referencePrice, marginMultiplier: update.marginMultiplier, finalPrice: calculated.finalPrice, exchangeRate: calculated.exchangeRate, lastSyncedAt: new Date() }
                });
                result.updated++;
              } else if (update.cardId) {
                await this.processOne(update, resolvedRounding, input, result, tx);
              }
            } catch (err: any) {
              result.failed++; result.errors.push({ listingId: update.listingId || 'N/A', message: err.message });
            }
          }
        }, { timeout: 20000 });
      }

      const completedAt = new Date();
      if (runDelegate) {
        await runDelegate.update({
          where: { id: run.id },
          data: { status: result.failed > 0 && result.updated === 0 ? 'failed' : 'completed', total: result.total, updated: result.updated, volatile: result.volatile, failed: result.failed, errors: result.errors.length ? JSON.stringify(result.errors) : null, completedAt }
        });
      }

      return { runId: run.id, source: input.source, total: result.total, updated: result.updated, volatile: result.volatile, failed: result.failed, roundingMultiple: resolvedRounding, errors: result.errors, pricingSourceStats, startedAt: startedAt.toISOString(), completedAt: completedAt.toISOString() };
    } catch (error) {
      const completedAt = new Date();
      if (runDelegate) await runDelegate.update({ where: { id: run.id }, data: { status: 'failed', total: result.total, updated: result.updated, volatile: result.volatile, failed: result.failed || 1, errors: JSON.stringify([...result.errors, { listingId: 'N/A', message: (error as Error).message }]), completedAt } });
      throw error;
    }
  }

  static async getRecentRuns(limit: number = 20, storeId?: string) {
    const runDelegate = getPriceSyncRunDelegate();
    if (!runDelegate) return [];
    const runs = await runDelegate.findMany({ ...(storeId ? { where: { storeId } } : {}), orderBy: { startedAt: 'desc' }, take: Math.min(Math.max(limit, 1), 100) });
    return runs.map((run: any) => ({ ...run, parsedErrors: parseRunErrors(run.errors || null) }));
  }

  static async getRunById(runId: string, storeId?: string) {
    const runDelegate = getPriceSyncRunDelegate();
    if (!runDelegate) return null;
    const run = storeId && runDelegate.findFirst
      ? await runDelegate.findFirst({ where: { id: runId, storeId } })
      : await runDelegate.findUnique({ where: { id: runId } });
    if (!run) return null;
    if (storeId && run.storeId !== storeId) return null;
    return { ...run, parsedErrors: parseRunErrors(run.errors || null) };
  }
}
