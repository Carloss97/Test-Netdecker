// src/services/ExternalImportService.ts
// Imports cards from external databases (Scryfall, PokémonTCG, YGOPRODeck, TCGCsv) into
// our local database (Card, Edition, Listing models).

import prisma from '../utils/db.js';
import { TCGType, CardCondition } from '@prisma/client';
import type { ExternalCard } from './CardDatabaseService.js';
import { CardDatabaseService } from './CardDatabaseService.js';
import { ExchangeRateService } from './ExchangeRateService.js';
import { DEFAULT_MARGIN_MULTIPLIER } from '../config/pricing.js';
import { PriceSyncService } from './PriceSyncService.js';
import { NotFoundError } from '../utils/errors.js';

export interface ImportExternalCardOptions {
  storeId?: string;
  createListing?: boolean;
  referencePrice?: number;     // USD — overrides the external price
  marginMultiplier?: number;
  quantity?: number;
  condition?: CardCondition;
  concurrency?: number;
  syncPrices?: boolean;
}

export interface ImportExternalCardResult {
  cardId: string;
  listingId?: string;
  action: 'created' | 'updated';
  card: {
    cardName: string;
    editionCode: string;
    externalId: string;
  };
}

export interface BulkImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ externalId: string; message: string }>;
  results: ImportExternalCardResult[];
}

export class ExternalImportService {
  private static normalizeRarity(rarity?: string): string {
    return (rarity || 'Unknown').trim() || 'Unknown';
  }

  /**
   * Return a reasonable default price based on TCG and rarity.
   * Used when external APIs don't provide pricing data.
   */
  private static getDefaultPrice(tcg: TCGType, rarity?: string): number {
    // Base prices by TCG (in USD)
    const basePrices: Record<TCGType, number> = {
      MAGIC: 0.50,
      POKEMON: 0.75,
      YUGIOH: 0.50,
      ONE_PIECE: 0.35,
      DIGIMON: 0.35,
      WEISS_SCHWARZ: 0.35,
    };

    const basePrice = basePrices[tcg] || 0.50;

    // Multiplier by rarity (common=1x, rare=2-10x, etc)
    const rarityLower = (rarity || '').toLowerCase();
    let rarityMultiplier = 1;
    if (rarityLower.includes('mythic') || rarityLower.includes('secret') || rarityLower.includes('ultimate')) {
      rarityMultiplier = 3.0;
    } else if (rarityLower.includes('ultra') || rarityLower.includes('gold') || rarityLower.includes('rainbow')) {
      rarityMultiplier = 2.0;
    } else if (rarityLower.includes('super') || rarityLower.includes('hyper')) {
      rarityMultiplier = 1.5;
    } else if (rarityLower.includes('rare') || rarityLower.includes('holo')) {
      rarityMultiplier = 1.2;
    } else if (rarityLower.includes('uncommon')) {
      rarityMultiplier = 1.0;
    } else {
      rarityMultiplier = 0.75; // common
    }

    return Math.round(basePrice * rarityMultiplier * 100) / 100;
  }

  /**
   * Resolve or create the TCG record from TCGType.
   */
  private static async resolveTCG(tcgType: TCGType) {
    return prisma.tCG.findFirst({ where: { name: tcgType } });
  }

  /**
   * Resolve or create an Edition from external card data.
   */
  private static async resolveEdition(tcgId: string, card: ExternalCard) {
    const existing = await prisma.edition.findUnique({
      where: { tcgId_editionCode: { tcgId, editionCode: card.editionCode } },
    });
    if (existing) return existing;

    return prisma.edition.create({
      data: {
        tcgId,
        editionCode: card.editionCode,
        editionName: card.editionName,
        isActive: true,
      },
    });
  }

  /**
   * Import (upsert) a single external card into the local database.
   */
  static async importCard(
    externalCard: ExternalCard,
    options: ImportExternalCardOptions = {},
  ): Promise<ImportExternalCardResult> {
    const tcg = await this.resolveTCG(externalCard.tcg as TCGType);
    if (!tcg) {
      throw new NotFoundError(`TCG ${externalCard.tcg} not found in database. Run prisma:seed first.`);
    }

    const edition = await this.resolveEdition(tcg.id, externalCard);
    const rarity = this.normalizeRarity(externalCard.rarity);

    const existing = await prisma.card.findUnique({
      where: {
        tcgId_editionId_cardCode_rarity: {
          tcgId: tcg.id,
          editionId: edition.id,
          cardCode: externalCard.externalId,
          rarity,
        },
      },
    });

    let card: { id: string; cardName: string };
    let action: 'created' | 'updated';

    if (existing) {
      card = await prisma.card.update({
        where: { id: existing.id },
        data: {
          cardName: externalCard.cardName,
          cardNumber: externalCard.cardNumber,
          rarity,
          colorIdentity: externalCard.colorIdentity,
          imageUrl: externalCard.imageUrl,
          description: externalCard.description,
          tags: externalCard.tags || '',
        },
      });
      action = 'updated';
    } else {
      card = await prisma.card.create({
        data: {
          tcgId: tcg.id,
          editionId: edition.id,
          cardCode: externalCard.externalId,
          cardName: externalCard.cardName,
          cardNumber: externalCard.cardNumber,
          rarity,
          colorIdentity: externalCard.colorIdentity,
          imageUrl: externalCard.imageUrl,
          description: externalCard.description,
          tags: externalCard.tags || '',
        },
      });
      action = 'created';
    }

    let listingId: string | undefined;

    if (options.createListing) {
      const resolvedStoreId = options.storeId ?? (await prisma.store.findFirst({
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      }))?.id;
      if (!resolvedStoreId) {
        throw new NotFoundError('Store not found to create listing');
      }

      // Determine the reference price: prefer passed option, then external market price, then default
      const externalPrice = externalCard.priceMarket ?? externalCard.priceMid ?? externalCard.priceLow;
      const refPrice = options.referencePrice ?? externalPrice ?? this.getDefaultPrice(externalCard.tcg as TCGType, rarity);
      
      // Log precio para debugging
      if (!externalPrice) {
        console.warn(`[Import] ${externalCard.tcg} ${externalCard.cardName}: No external price found (using default $${refPrice.toFixed(2)})`);
      } else {
        console.info(`[Import] ${externalCard.tcg} ${externalCard.cardName}: Using API price $${externalPrice.toFixed(2)}`);
      }

      const condition = options.condition || CardCondition.NM;

      const existingListing = await prisma.listing.findUnique({
        where: { cardId_condition_rarity: { cardId: card.id, condition, rarity } },
      });

      const marginMultiplier = options.marginMultiplier ?? DEFAULT_MARGIN_MULTIPLIER;
      const quantity = options.quantity ?? 0;

      // Fetch the real exchange rate for accurate CLP price calculation
      const exchangeRate = await ExchangeRateService.getUSDtoCLPRate().catch(() => 1.0);

      if (existingListing) {
        const updated = await prisma.listing.update({
          where: { id: existingListing.id },
          data: {
            referencePrice: refPrice,
            marginMultiplier,
            exchangeRate,
            finalPrice: refPrice * marginMultiplier * exchangeRate,
            lastSyncedAt: new Date(),
            // Preserve everHadStock — only update to true if new quantity > 0
            ...(quantity > 0 ? { everHadStock: true } : {}),
          },
        });
        listingId = updated.id;
      } else {
        const created = await prisma.listing.create({
          data: {
            storeId: resolvedStoreId,
            cardId: card.id,
            editionId: edition.id,
            condition,
            rarity,
            quantity,
            referencePrice: refPrice,
            marginMultiplier,
            exchangeRate,
            finalPrice: refPrice * marginMultiplier * exchangeRate,
            status: 'active',
            lastSyncedAt: new Date(),
            everHadStock: quantity > 0,
          },
        });
        listingId = created.id;
      }
    }

    return {
      cardId: card.id,
      listingId,
      action,
      card: {
        cardName: externalCard.cardName,
        editionCode: externalCard.editionCode,
        externalId: externalCard.externalId,
      },
    };
  }

  /**
   * Bulk import a list of external cards.
   */
  static async bulkImportCards(
    cards: ExternalCard[],
    options: ImportExternalCardOptions = {},
  ): Promise<BulkImportResult> {
    const result: BulkImportResult = {
      total: cards.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      results: [],
    };

    const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 12));
    let cursor = 0;

    const worker = async () => {
      while (cursor < cards.length) {
        const index = cursor;
        cursor += 1;
        const card = cards[index];
        if (!card) {
          continue;
        }

        try {
          const r = await this.importCard(card, options);
          result.results.push(r);
          if (r.action === 'created') result.created += 1;
          else result.updated += 1;
        } catch (err) {
          result.errors.push({ externalId: card.externalId, message: (err as Error).message });
          result.skipped += 1;
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, cards.length) }, () => worker()));

    return result;
  }

  /**
   * Search an external TCG database and import all results.
   */
  static async searchAndImport(
    tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ',
    query: string,
    options: ImportExternalCardOptions & { setCode?: string; page?: number } = {},
  ): Promise<BulkImportResult> {
    const cards = await CardDatabaseService.searchCards(tcg, query, {
      setCode: options.setCode,
      page: options.page,
    });
    return this.bulkImportCards(cards, options);
  }

  /**
   * Import all cards from an edition/set code.
   */
  static async importSet(
    tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ',
    setCode: string,
    options: ImportExternalCardOptions = {},
  ): Promise<BulkImportResult> {
    const cards = await CardDatabaseService.getSetCards(tcg, setCode);
    const result = await this.bulkImportCards(cards, options);

    // Optionally trigger a price sync for the imported edition.
    // Only run when explicitly requested (options.syncPrices === true) to avoid
    // surprising slow/blocking behavior for callers that don't expect a sync.
    if (options.syncPrices === true) {
      // Run the sync in background so the import response isn't blocked by the sync.
      (async () => {
        try {
          const tcgRecord = await prisma.tCG.findFirst({ where: { name: tcg }, select: { id: true } });
          if (!tcgRecord) return;

          const edition = await prisma.edition.findFirst({ where: { tcgId: tcgRecord.id, editionCode: setCode.toUpperCase() }, select: { id: true } });
          if (!edition) return;

          console.info(`[Import] triggering background price sync for edition ${edition.id}`);
          await PriceSyncService.runPriceSync({ source: 'manual', editionId: edition.id, fetchExternalPrices: true });
          console.info(`[Import] background price sync completed for edition ${edition.id}`);
        } catch (err) {
          console.error('[Import] background price sync failed:', err instanceof Error ? err.message : err);
        }
      })();
    }

    return result;
  }
}
