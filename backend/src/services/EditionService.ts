// src/services/EditionService.ts
import prisma from '../utils/db.js';

interface CreateEditionInput {
  tcgId: string;
  editionCode: string;
  editionName: string;
  releaseDate?: Date;
  isActive?: boolean;
}

export class EditionService {
  /**
   * Get edition by ID
   */
  static async getEdition(id: string) {
    return prisma.edition.findUnique({
      where: { id },
      include: { cards: true }
    });
  }

  /**
   * Get editions by TCG
   */
  static async getEditionsByTCG(tcgId: string, activeOnly: boolean = true) {
    return prisma.edition.findMany({
      where: {
        tcgId,
        ...(activeOnly ? { isActive: true } : {})
      },
      include: { cards: true },
      orderBy: { releaseDate: 'desc' }
    });
  }

  /**
   * Create edition
   */
  static async createEdition(input: CreateEditionInput) {
    return prisma.edition.create({
      data: {
        ...input,
        isActive: input.isActive !== false
      }
    });
  }

  /**
   * Find or create edition
   */
  static async upsertEdition(tcgId: string, editionCode: string, editionName: string, releaseDate?: Date) {
    return prisma.edition.upsert({
      where: {
        tcgId_editionCode: {
          tcgId,
          editionCode
        }
      },
      update: { editionName, releaseDate },
      create: {
        tcgId,
        editionCode,
        editionName,
        releaseDate
      }
    });
  }

  /**
   * Update edition
   */
  static async updateEdition(id: string, data: Partial<CreateEditionInput>) {
    return prisma.edition.update({
      where: { id },
      data
    });
  }

  /**
   * Deactivate edition
   */
  static async deactivateEdition(id: string) {
    return this.updateEdition(id, { isActive: false });
  }

  /**
   * Get card count for edition
   */
  static async getCardCount(editionId: string) {
    return prisma.card.count({
      where: { editionId }
    });
  }
}
