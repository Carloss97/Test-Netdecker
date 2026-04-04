// src/services/ExternalImportService.ts
// Imports cards from external databases (Scryfall, PokémonTCG, YGOPRODeck) into
// our local database (Card, Edition, Listing models).

import prisma from '../utils/db.js';
import { TCGType, CardCondition } from '@prisma/client';
import type { ExternalCard } from './CardDatabaseService.js';
import { CardDatabaseService } from './CardDatabaseService.js';

export interface ImportExternalCardOptions {
  createListing?: boolean;
  referencePrice?: number;     // USD — overrides the external price
  marginMultiplier?: number;
  quantity?: number;
  condition?: CardCondition;
  concurrency?: number;
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
      throw new Error(`TCG ${externalCard.tcg} not found in database. Run prisma:seed first.`);
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
      // Determine the reference price: prefer passed option, then external market price
      const refPrice =
        options.referencePrice ??
        externalCard.priceMarket ??
        externalCard.priceMid ??
        externalCard.priceLow ??
        0;

      const condition = options.condition || CardCondition.NM;

      const existingListing = await prisma.listing.findUnique({
        where: { cardId_condition_rarity: { cardId: card.id, condition, rarity } },
      });

      const marginMultiplier = options.marginMultiplier ?? 1.2;
      const quantity = options.quantity ?? 0;

      if (existingListing) {
        const updated = await prisma.listing.update({
          where: { id: existingListing.id },
          data: {
            referencePrice: refPrice,
            marginMultiplier,
            finalPrice: refPrice * marginMultiplier * existingListing.exchangeRate,
            lastSyncedAt: new Date(),
          },
        });
        listingId = updated.id;
      } else {
        const created = await prisma.listing.create({
          data: {
            cardId: card.id,
            editionId: edition.id,
            condition,
            rarity,
            quantity,
            referencePrice: refPrice,
            marginMultiplier,
            exchangeRate: 1.0,
            finalPrice: refPrice * marginMultiplier,
            status: 'active',
            lastSyncedAt: new Date(),
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
    tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE',
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
    tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE',
    setCode: string,
    options: ImportExternalCardOptions = {},
  ): Promise<BulkImportResult> {
    const cards = await CardDatabaseService.getSetCards(tcg, setCode);
    return this.bulkImportCards(cards, options);
  }
}
