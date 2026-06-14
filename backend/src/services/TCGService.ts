// src/services/TCGService.ts
import prisma from '../utils/db.js';
import type { TCGType } from '@prisma/client';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis.js';
import { isLocalOnlyMode } from '../config/appConfig.js';
import { LocalBootstrapService } from './LocalBootstrapService.js';

const TCGS_CACHE_KEY = 'tcgs:all';
const CACHE_TTL = 3600; // 1 hour

export class TCGService {
  private static isUnknownIsActiveError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('Unknown argument `isActive`');
  }

  private static async findManyTCGs(includeInactive: boolean) {
    try {
      return await prisma.tCG.findMany({
        where: includeInactive ? {} : { isActive: true },
        include: {
          editions: {
            where: includeInactive ? {} : { isActive: true },
            orderBy: { releaseDate: 'desc' }
          }
        },
        orderBy: { displayName: 'asc' }
      } as any);
    } catch (error) {
      if (!this.isUnknownIsActiveError(error)) throw error;
      return prisma.tCG.findMany({
        include: {
          editions: {
            orderBy: { releaseDate: 'desc' }
          }
        },
        orderBy: { displayName: 'asc' }
      } as any);
    }
  }

  /**
   * Get all TCGs
   */
  static async getAllTCGs(includeInactive = false) {
    let tcgs = await this.findManyTCGs(includeInactive);

    if (tcgs.length === 0 && isLocalOnlyMode()) {
      await LocalBootstrapService.ensureDefaultTCGs();
      tcgs = await this.findManyTCGs(includeInactive);
    }

    return tcgs;
  }

  /**
   * Update TCG status
   */
  static async setTCGStatus(id: string, isActive: boolean) {
    const tcg = await prisma.tCG.update({
      where: { id },
      data: { isActive }
    });
    await cacheDel(TCGS_CACHE_KEY);
    return tcg;
  }

  /**
   * Get TCG by ID
   */
  static async getTCGById(id: string) {
    try {
      return await prisma.tCG.findUnique({
        where: { id },
        include: {
          editions: {
            where: { isActive: true },
            orderBy: { releaseDate: 'desc' }
          }
        }
      } as any);
    } catch (error) {
      if (!this.isUnknownIsActiveError(error)) throw error;
      return prisma.tCG.findUnique({
        where: { id },
        include: { editions: { orderBy: { releaseDate: 'desc' } } }
      } as any);
    }
  }

  /**
   * Get TCG by name
   */
  static async getTCGByName(name: TCGType) {
    try {
      return await prisma.tCG.findUnique({
        where: { name },
        include: {
          editions: {
            where: { isActive: true },
            orderBy: { releaseDate: 'desc' }
          }
        }
      } as any);
    } catch (error) {
      if (!this.isUnknownIsActiveError(error)) throw error;
      return prisma.tCG.findUnique({
        where: { name },
        include: { editions: { orderBy: { releaseDate: 'desc' } } }
      } as any);
    }
  }

  /**
   * Initialize default TCGs (run once on setup)
   */
  static async initializeDefaultTCGs() {
    const defaults = [
      { name: 'MAGIC' as TCGType, displayName: 'Magic: The Gathering' },
      { name: 'POKEMON' as TCGType, displayName: 'Pokémon Trading Card Game' },
      { name: 'YUGIOH' as TCGType, displayName: 'Yu-Gi-Oh!' },
      { name: 'ONE_PIECE' as TCGType, displayName: 'One Piece Trading Card Game' },
      { name: 'DIGIMON' as TCGType, displayName: 'Digimon Card Game' },
      { name: 'WEISS_SCHWARZ' as TCGType, displayName: 'Weiss Schwarz' },
    ];

    for (const tcg of defaults) {
      await prisma.tCG.upsert({
        where: { name: tcg.name },
        update: {},
        create: {
          name: tcg.name,
          displayName: tcg.displayName,
          isActive: true,
        }
      } as any);
    }

    // Clear cache
    await cacheDel(TCGS_CACHE_KEY);
  }

  /**
   * Create or update a TCG
   */
  static async upsertTCG(name: TCGType, displayName: string, description?: string) {
    const tcg = await prisma.tCG.upsert({
      where: { name },
      update: { displayName, description },
      create: { name, displayName, description }
    });

    // Clear cache
    await cacheDel(TCGS_CACHE_KEY);
    return tcg;
  }
}
