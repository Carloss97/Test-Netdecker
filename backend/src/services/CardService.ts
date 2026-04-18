// src/services/CardService.ts
import prisma from '../utils/db.js';
import { NotFoundError } from '../utils/errors.js';
import type { Prisma } from '@prisma/client';
import createD1Proxy from '../utils/d1Proxy.js';

console.log('[CardService] Loaded, prisma available:', prisma ? 'YES' : 'NO');

interface CreateCardInput {
  tcgId: string;
  editionId: string;
  cardCode: string;
  cardName: string;
  cardNumber?: string;
  rarity: string;
  colorIdentity?: string;
  tags?: string;
  imageUrl?: string;
  description?: string;
}

function normalizeRarity(rarity?: string): string {
  return (rarity || 'Unknown').trim() || 'Unknown';
}

export class CardService {
  /**
   * Create a new card
   */
  static async createCard(input: CreateCardInput) {
    return prisma.card.create({
      data: {
        ...input,
        rarity: normalizeRarity(input.rarity),
        tags: input.tags || ''
      }
    });
  }

  /**
   * Get card by ID
   */
  static async getCard(id: string) {
    if (process.env.USE_D1 === 'true') {
      const db = createD1Proxy(prisma);
      const CardD1 = await import('../../../functions/_shared/cardService.js');
      const rec = await CardD1.getCard(db, id);
      return rec;
    }

    return prisma.card.findUnique({
      where: { id },
      include: {
        listings: true
      }
    });
  }

  /**
   * Find card by code (TCG/Edition/CardCode)
   */
  static async findCardByCode(tcgId: string, editionId: string, cardCode: string, rarity?: string) {
    if (process.env.USE_D1 === 'true') {
      const db = createD1Proxy(prisma);
      const CardD1 = await import('../../../functions/_shared/cardService.js');
      return CardD1.findCardByCode(db, tcgId, editionId, cardCode, rarity);
    }

    return prisma.card.findUnique({
      where: {
        tcgId_editionId_cardCode_rarity: {
          tcgId,
          editionId,
          cardCode,
          rarity: normalizeRarity(rarity),
        }
      } as Prisma.CardWhereUniqueInput,
      include: {
        listings: true
      }
    });
  }

  /**
   * Search cards by name (case-insensitive, partial match)
   */
  static async searchByName(name: string, tcgId?: string, limit: number = 20) {
    if (process.env.USE_D1 === 'true') {
      const db = createD1Proxy(prisma);
      const CardD1 = await import('../../../functions/_shared/cardService.js');
      return CardD1.searchByName(db, name, tcgId, limit);
    }

    const useSqlite = Boolean(process.env.USE_SQLITE && process.env.USE_SQLITE !== 'false');

    const cardNameFilter: Record<string, unknown> = useSqlite
      ? { contains: name }
      : { contains: name, mode: 'insensitive' } as any;

    const where: Record<string, unknown> = { cardName: cardNameFilter };

    if (tcgId) {
      where.tcgId = tcgId;
    }

    return prisma.card.findMany({
      where,
      include: { listings: true, edition: true },
      take: limit,
    });
  }

  /**
   * Search cards by code (case-insensitive, partial match).
   * Returns all matching cards across editions and rarities.
   */
  static async searchByCode(code: string, tcgId?: string, limit: number = 50) {
    if (process.env.USE_D1 === 'true') {
      const db = createD1Proxy(prisma);
      const CardD1 = await import('../../../functions/_shared/cardService.js');
      return CardD1.searchByCode(db, code, tcgId, limit);
    }

    const normalized = code.trim();
    const useSqlite = Boolean(process.env.USE_SQLITE && process.env.USE_SQLITE !== 'false');
    const containsFilter = (val: string) => (useSqlite ? { contains: val } : { contains: val, mode: 'insensitive' } as any);

    const where: Record<string, unknown> = {
      OR: [
        { cardCode: containsFilter(normalized) },
        { cardNumber: containsFilter(normalized) },
        { edition: { editionCode: containsFilter(normalized) } }
      ]
    };

    if (tcgId) {
      where.tcgId = tcgId;
    }

    return prisma.card.findMany({
      where,
      include: { listings: true, edition: true },
      take: limit,
    });
  }

  /**
   * Get cards by edition
   */
  static async getCardsByEdition(editionId: string) {
    if (process.env.USE_D1 === 'true') {
      const db = createD1Proxy(prisma);
      const CardD1 = await import('../../../functions/_shared/cardService.js');
      return CardD1.getCardsByEdition(db, editionId);
    }

    return prisma.card.findMany({
      where: { editionId },
      include: { listings: true },
      orderBy: { cardNumber: 'asc' }
    });
  }

  /**
   * Get cards by TCG (can accept either tcgId or tcgName like "POKEMON")
   */
  static async getCardsByTCG(tcgIdentifier: string) {
    console.log('[CardService.getCardsByTCG] Called with:', tcgIdentifier);
    if (process.env.USE_D1 === 'true') {
      const db = createD1Proxy(prisma);
      const CardD1 = await import('../../../functions/_shared/cardService.js');
      return CardD1.getCardsByTCG(db, tcgIdentifier);
    }

    // First try lookup by ID
    let tcg = await prisma.tCG.findUnique({ where: { id: tcgIdentifier } });
    // Otherwise, try by name (enum). Use a focused findFirst to avoid complex type casts in the OR form.
    if (!tcg) {
      // Cast here is limited to this call because Prisma type for `name` is an enum-like union.
      // This keeps the rest of the code strongly typed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tcg = await (prisma as any).tCG.findFirst({ where: { name: tcgIdentifier } });
    }

    if (!tcg) {
      throw new NotFoundError(`TCG "${tcgIdentifier}" not found`);
    }

    return prisma.card.findMany({
      where: { tcgId: tcg.id },
      include: {
        listings: true,
        edition: true
      }
    });
  }

  /**
   * Update card
   */
  static async updateCard(id: string, data: Partial<CreateCardInput>) {
    return prisma.card.update({
      where: { id },
      data
    });
  }

  /**
   * Bulk upsert cards from CSV/import
   */
  static async bulkUpsertCards(cards: CreateCardInput[]) {
    if (process.env.USE_D1 === 'true') {
      const db = createD1Proxy(prisma);
      const CardD1 = await import('../../../functions/_shared/cardService.js');
      return CardD1.bulkUpsertCards(db, cards as any, {});
    }

    const results: { created: number; updated: number; errors: Array<{ cardCode: string; error: string }> } = {
      created: 0,
      updated: 0,
      errors: []
    };

    for (const cardData of cards) {
      try {
        const existing = await this.findCardByCode(
          cardData.tcgId,
          cardData.editionId,
          cardData.cardCode,
          cardData.rarity,
        );

        if (existing) {
          await this.updateCard(existing.id, cardData);
          results.updated++;
        } else {
          await this.createCard(cardData);
          results.created++;
        }
      } catch (error) {
        results.errors.push({
          cardCode: cardData.cardCode,
          error: (error as Error).message
        });
      }
    }

    return results;
  }

  /**
   * Delete card and its listings
   */
  static async deleteCard(id: string) {
    return prisma.card.delete({
      where: { id }
    });
  }
}
