// src/services/CardService.ts
import prisma from '../utils/db.js';
import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../utils/errors.js';

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
    return prisma.card.findUnique({
      where: {
        tcgId_editionId_cardCode_rarity: {
          tcgId,
          editionId,
          cardCode,
          rarity: normalizeRarity(rarity),
        }
      } as any,
      include: {
        listings: true
      }
    });
  }

  /**
   * Search cards by name (case-insensitive, partial match)
   */
  static async searchByName(name: string, tcgId?: string, limit: number = 20) {
    const where: any = {
      cardName: {
        contains: name,
        mode: 'insensitive'
      }
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
   * Search cards by code (case-insensitive, partial match).
   * Returns all matching cards across editions and rarities.
   */
  static async searchByCode(code: string, tcgId?: string, limit: number = 50) {
    const normalized = code.trim();
    const where: any = {
      OR: [
        {
          cardCode: {
            contains: normalized,
            mode: 'insensitive'
          }
        },
        {
          cardNumber: {
            contains: normalized,
            mode: 'insensitive'
          }
        },
        {
          edition: {
            editionCode: {
              contains: normalized,
              mode: 'insensitive'
            }
          }
        }
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

    // First, try to find the TCG by ID or by name (enum)
    const tcg = await prisma.tCG.findFirst({
      where: {
        OR: [
          { id: tcgIdentifier },
          { name: tcgIdentifier as any }
        ]
      }
    });

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
    const results = {
      created: 0,
      updated: 0,
      errors: [] as any[]
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
