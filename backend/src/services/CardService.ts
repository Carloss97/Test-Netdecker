// src/services/CardService.ts
import prisma from '../utils/db.js';
import { v4 as uuidv4 } from 'uuid';

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
      include: { listings: true },
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
   * Get cards by TCG
   */
  static async getCardsByTCG(tcgId: string) {
    return prisma.card.findMany({
      where: { tcgId },
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
