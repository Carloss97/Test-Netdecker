// src/services/TCGService.ts
import prisma from '../utils/db.js';
import { TCGType } from '@prisma/client';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis.js';

const TCGS_CACHE_KEY = 'tcgs:all';
const CACHE_TTL = 3600; // 1 hour

export class TCGService {
  /**
   * Get all TCGs
   */
  static async getAllTCGs() {
    // Try cache
    const cached = await cacheGet(TCGS_CACHE_KEY);
    if (cached) {
      return cached;
    }

    const tcgs = await prisma.tCG.findMany({
      include: {
        editions: {
          where: { isActive: true },
          orderBy: { releaseDate: 'desc' }
        }
      },
      orderBy: { displayName: 'asc' }
    });

    await cacheSet(TCGS_CACHE_KEY, tcgs, CACHE_TTL);
    return tcgs;
  }

  /**
   * Get TCG by ID
   */
  static async getTCGById(id: string) {
    return prisma.tCG.findUnique({
      where: { id },
      include: {
        editions: {
          where: { isActive: true },
          orderBy: { releaseDate: 'desc' }
        }
      }
    });
  }

  /**
   * Get TCG by name
   */
  static async getTCGByName(name: TCGType) {
    return prisma.tCG.findUnique({
      where: { name },
      include: {
        editions: {
          where: { isActive: true },
          orderBy: { releaseDate: 'desc' }
        }
      }
    });
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
        }
      });
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
