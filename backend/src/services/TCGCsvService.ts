// src/services/TCGCsvService.ts
// Integration with tcgcsv.com — a free, unauthenticated wrapper over TCGplayer data.
// Documentation: https://tcgcsv.com/
//
// Data hierarchy:
//   Category  → roughly a card game (e.g. categoryId 3 = Pokémon)
//   Group     → roughly a set/expansion within a category
//   Product   → individual card or product within a group
//   Price     → market/mid/low price per product (joined via productId)
//
// Known TCGplayer category IDs used by this service:
//   1  → Magic: The Gathering
//   2  → Yu-Gi-Oh!
//   3  → Pokémon
//   6  → Weiss Schwarz
//   65 → Digimon Card Game
//   87 → One Piece TCG

import axios from 'axios';
import { cacheGet, cacheSet } from '../utils/redis.js';
import type { ExternalCard, ExternalEdition } from './CardDatabaseService.js';

// ─── TCG category map ───────────────────────────────────────────────────────

export type TCGCsvTcg = 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';

export const TCGCSV_CATEGORY_IDS: Record<TCGCsvTcg, number> = {
  MAGIC: 1,
  YUGIOH: 2,
  POKEMON: 3,
  WEISS_SCHWARZ: 6,
  DIGIMON: 65,
  ONE_PIECE: 87,
};

const TCG_DISPLAY_NAMES: Record<TCGCsvTcg, string> = {
  MAGIC: 'Magic: The Gathering',
  YUGIOH: 'Yu-Gi-Oh!',
  POKEMON: 'Pokémon',
  WEISS_SCHWARZ: 'Weiss Schwarz',
  DIGIMON: 'Digimon Card Game',
  ONE_PIECE: 'One Piece TCG',
};

// ─── API response types ──────────────────────────────────────────────────────

interface TcgCsvGroup {
  groupId: number;
  name: string;
  abbreviation?: string;
  isSupplemental?: boolean;
  publishedOn?: string;
  modifiedOn?: string;
  categoryId?: number;
}

interface TcgCsvExtendedData {
  name?: string;
  displayName?: string;
  value?: string;
}

interface TcgCsvProduct {
  productId: number;
  name: string;
  cleanName?: string;
  imageUrl?: string;
  groupId: number;
  url?: string;
  modifiedOn?: string;
  imageCount?: number;
  extendedData?: TcgCsvExtendedData[];
  subTypeName?: string;
  presaleInfo?: Record<string, unknown>;
}

interface TcgCsvPrice {
  productId: number;
  lowPrice?: number | null;
  midPrice?: number | null;
  highPrice?: number | null;
  marketPrice?: number | null;
  directLowPrice?: number | null;
  subTypeName?: string;
}

interface TcgCsvListResponse<T> {
  totalItems?: number;
  success?: boolean;
  errors?: string[];
  results: T[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TCGCSV_BASE = 'https://tcgcsv.com/tcgplayer';
const CACHE_TTL = 3600 * 3; // 3 hours — matches existing service TTL
const REQUEST_TIMEOUT = 20000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract a named field from TCGplayer extendedData array.
 */
function getExtendedValue(extendedData: TcgCsvExtendedData[] | undefined, fieldName: string): string | undefined {
  if (!extendedData?.length) return undefined;
  const lc = fieldName.toLowerCase();
  const entry = extendedData.find(
    (e) => (e.name || e.displayName || '').toLowerCase() === lc,
  );
  return entry?.value ?? undefined;
}

/**
 * Choose the best price from a price record.
 * Priority: marketPrice → midPrice → lowPrice
 */
function bestPrice(p: TcgCsvPrice): number | undefined {
  const v = p.marketPrice ?? p.midPrice ?? p.lowPrice;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

/**
 * Map TCGCsv group + product + price → ExternalCard.
 */
function tcgCsvToExternal(
  product: TcgCsvProduct,
  group: TcgCsvGroup,
  tcg: TCGCsvTcg,
  price?: TcgCsvPrice,
): ExternalCard {
  const ext = product.extendedData ?? [];
  const rarity = getExtendedValue(ext, 'Rarity') ?? getExtendedValue(ext, 'rarity') ?? product.subTypeName;
  const cardNumber = getExtendedValue(ext, 'Number') ?? getExtendedValue(ext, 'CardNumber') ?? getExtendedValue(ext, 'CollectorNumber');
  const description = getExtendedValue(ext, 'OracleText') ?? getExtendedValue(ext, 'CardText') ?? getExtendedValue(ext, 'Description');
  const colorIdentity = getExtendedValue(ext, 'Color') ?? getExtendedValue(ext, 'Attribute');

  const editionCode = (group.abbreviation || String(group.groupId)).toUpperCase();

  return {
    externalId: String(product.productId),
    source: 'tcgcsv',
    tcg,
    cardName: product.name,
    cardNumber,
    editionCode,
    editionName: group.name,
    rarity,
    colorIdentity,
    imageUrl: product.imageUrl,
    description,
    priceLow: price?.lowPrice ?? undefined,
    priceMid: price?.midPrice ?? undefined,
    priceMarket: price ? bestPrice(price) : undefined,
  } as ExternalCard;
}

// ─── TCGCsvService ────────────────────────────────────────────────────────────

/**
 * Service that fetches catalog and pricing data from tcgcsv.com.
 *
 * tcgcsv.com mirrors TCGplayer data for free without requiring OAuth credentials,
 * making it an excellent supplement or replacement for the official TCGplayer API.
 *
 * Supports: MAGIC, POKEMON, YUGIOH, ONE_PIECE, DIGIMON, WEISS_SCHWARZ
 */
export class TCGCsvService {
  private static readonly MIN_REQUEST_DELAY_MS = 200; // Polite delay between requests
  private static lastRequestAt = 0;

  private static async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.MIN_REQUEST_DELAY_MS) {
      await sleep(this.MIN_REQUEST_DELAY_MS - elapsed);
    }
    this.lastRequestAt = Date.now();
  }

  private static async get<T>(url: string): Promise<T> {
    await this.throttle();
    const { data } = await axios.get<T>(url, { timeout: REQUEST_TIMEOUT });
    return data;
  }

  // ── Groups (sets) ────────────────────────────────────────────────────────

  /**
   * Fetch all groups (sets/expansions) for a given TCG category.
   */
  static async getGroups(tcg: TCGCsvTcg): Promise<TcgCsvGroup[]> {
    const categoryId = TCGCSV_CATEGORY_IDS[tcg];
    const cacheKey = `tcgcsv:groups:${categoryId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as TcgCsvGroup[];

    try {
      const data = await this.get<TcgCsvListResponse<TcgCsvGroup>>(
        `${TCGCSV_BASE}/${categoryId}/groups`,
      );
      const groups = Array.isArray(data?.results) ? data.results : [];
      if (groups.length > 0) {
        await cacheSet(cacheKey, groups, CACHE_TTL);
      }
      return groups;
    } catch (err) {
      console.error(`[TCGCsvService] getGroups(${tcg}) error:`, (err as Error).message);
      return [];
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  /**
   * Fetch all products (cards) for a specific group within a category.
   */
  static async getGroupProducts(tcg: TCGCsvTcg, groupId: number): Promise<TcgCsvProduct[]> {
    const categoryId = TCGCSV_CATEGORY_IDS[tcg];
    const cacheKey = `tcgcsv:products:${categoryId}:${groupId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as TcgCsvProduct[];

    try {
      const data = await this.get<TcgCsvListResponse<TcgCsvProduct>>(
        `${TCGCSV_BASE}/${categoryId}/${groupId}/products`,
      );
      const products = Array.isArray(data?.results) ? data.results : [];
      if (products.length > 0) {
        await cacheSet(cacheKey, products, CACHE_TTL);
      }
      return products;
    } catch (err) {
      console.error(`[TCGCsvService] getGroupProducts(${tcg}, ${groupId}) error:`, (err as Error).message);
      return [];
    }
  }

  // ── Prices ────────────────────────────────────────────────────────────────

  /**
   * Fetch prices for all products in a specific group within a category.
   */
  static async getGroupPrices(tcg: TCGCsvTcg, groupId: number): Promise<TcgCsvPrice[]> {
    const categoryId = TCGCSV_CATEGORY_IDS[tcg];
    const cacheKey = `tcgcsv:prices:${categoryId}:${groupId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as TcgCsvPrice[];

    try {
      const data = await this.get<TcgCsvListResponse<TcgCsvPrice>>(
        `${TCGCSV_BASE}/${categoryId}/${groupId}/prices`,
      );
      const prices = Array.isArray(data?.results) ? data.results : [];
      if (prices.length > 0) {
        await cacheSet(cacheKey, prices, CACHE_TTL);
      }
      return prices;
    } catch (err) {
      console.error(`[TCGCsvService] getGroupPrices(${tcg}, ${groupId}) error:`, (err as Error).message);
      return [];
    }
  }

  // ── Unified helpers ──────────────────────────────────────────────────────

  /**
   * List all sets (groups) for a TCG.
   * Implements the ExternalEdition interface used by CardDatabaseService.
   */
  static async listSets(tcg: TCGCsvTcg): Promise<ExternalEdition[]> {
    const groups = await this.getGroups(tcg);
    return groups.map((g) => ({
      code: (g.abbreviation || String(g.groupId)).toUpperCase(),
      name: g.name,
      releaseDate: g.publishedOn,
      source: 'tcgcsv' as const,
    }));
  }

  /**
   * Fetch all cards for a specific set (group), with prices joined in.
   * Set code is matched against the group's abbreviation or groupId.
   */
  static async getSetCards(tcg: TCGCsvTcg, setCode: string): Promise<ExternalCard[]> {
    const cacheKey = `tcgcsv:set-cards:${TCGCSV_CATEGORY_IDS[tcg]}:${setCode.toUpperCase()}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalCard[];

    const groups = await this.getGroups(tcg);
    const normalizedCode = setCode.trim().toUpperCase();

    // Match by abbreviation first, then by groupId string
    const group = groups.find(
      (g) =>
        (g.abbreviation || '').toUpperCase() === normalizedCode ||
        String(g.groupId) === normalizedCode,
    );

    if (!group) {
      console.warn(`[TCGCsvService] getSetCards: set "${setCode}" not found for ${tcg}`);
      return [];
    }

    const [products, prices] = await Promise.all([
      this.getGroupProducts(tcg, group.groupId),
      this.getGroupPrices(tcg, group.groupId),
    ]);

    // Build a price lookup keyed by productId + subTypeName so we can prefer "Normal" foils etc.
    // We consolidate by choosing the best price per productId (Normal > first available).
    const priceByProductId = new Map<number, TcgCsvPrice>();
    for (const p of prices) {
      const existing = priceByProductId.get(p.productId);
      if (!existing) {
        priceByProductId.set(p.productId, p);
      } else {
        // Prefer the "Normal" or "Holofoil" sub-type for consistency, otherwise keep higher market price
        const existingBest = bestPrice(existing) ?? 0;
        const newBest = bestPrice(p) ?? 0;
        if (
          (!existing.subTypeName || existing.subTypeName === 'Normal') ||
          (p.subTypeName === 'Normal' && existing.subTypeName !== 'Normal') ||
          newBest > existingBest
        ) {
          priceByProductId.set(p.productId, p);
        }
      }
    }

    // Filter to card-like products only (exclude sealed boxes, packs, etc.)
    // In TCGplayer data, cards typically have extendedData with rarity info
    const cards = products
      .filter((p) => {
        // Products with extendedData that includes a Rarity or Number field are cards
        const ext = p.extendedData ?? [];
        const hasRarity = ext.some((e) => (e.name || e.displayName || '').toLowerCase().includes('rarity'));
        const hasNumber = ext.some((e) => {
          const n = (e.name || e.displayName || '').toLowerCase();
          return n === 'number' || n === 'cardnumber' || n === 'collectornumber';
        });
        return hasRarity || hasNumber || ext.length > 0;
      })
      .map((p) => tcgCsvToExternal(p, group, tcg, priceByProductId.get(p.productId)));

    if (cards.length > 0) {
      await cacheSet(cacheKey, cards, CACHE_TTL);
    }
    return cards;
  }

  /**
   * Search cards by name within a TCG (searches across all sets, cached per-set).
   */
  static async searchCards(tcg: TCGCsvTcg, query: string): Promise<ExternalCard[]> {
    const cacheKey = `tcgcsv:search:${TCGCSV_CATEGORY_IDS[tcg]}:${query.toLowerCase()}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalCard[];

    // For search, we need to scan across groups. To avoid excessive API calls,
    // we load groups and search per group until we find results (max 5 groups).
    const groups = await this.getGroups(tcg);
    const lowerQuery = query.toLowerCase();
    const found: ExternalCard[] = [];

    for (const group of groups.slice(0, 5)) {
      const [products, prices] = await Promise.all([
        this.getGroupProducts(tcg, group.groupId),
        this.getGroupPrices(tcg, group.groupId),
      ]);

      const priceByProductId = new Map<number, TcgCsvPrice>(
        prices.map((p) => [p.productId, p]),
      );

      const matches = products
        .filter((p) => p.name.toLowerCase().includes(lowerQuery))
        .map((p) => tcgCsvToExternal(p, group, tcg, priceByProductId.get(p.productId)));

      found.push(...matches);
    }

    if (found.length > 0) {
      await cacheSet(cacheKey, found, CACHE_TTL);
    }
    return found;
  }

  /**
   * Fetch price data for a specific product across all groups in a TCG.
   * Returns an array of price records for that productId (may include multiple sub-types).
   */
  static async getProductPrices(tcg: TCGCsvTcg, productId: number): Promise<TcgCsvPrice[]> {
    const cacheKey = `tcgcsv:product-prices:${TCGCSV_CATEGORY_IDS[tcg]}:${productId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as TcgCsvPrice[];

    // We need to know which group this product belongs to.
    // Without a direct product→group lookup, we scan through recent groups (limited).
    const groups = await this.getGroups(tcg);

    for (const group of groups) {
      const prices = await this.getGroupPrices(tcg, group.groupId);
      const matching = prices.filter((p) => p.productId === productId);
      if (matching.length > 0) {
        await cacheSet(cacheKey, matching, CACHE_TTL);
        return matching;
      }
    }

    return [];
  }

  /**
   * Convenience: get the best market price for a product.
   */
  static async getBestPriceForProduct(tcg: TCGCsvTcg, productId: number): Promise<number | null> {
    const prices = await this.getProductPrices(tcg, productId);
    if (!prices.length) return null;

    const best = prices
      .map((p) => bestPrice(p))
      .filter((v): v is number => v !== undefined)
      .sort((a, b) => b - a)[0];

    return best ?? null;
  }

  /**
   * Returns the display name for a TCG.
   */
  static getDisplayName(tcg: TCGCsvTcg): string {
    return TCG_DISPLAY_NAMES[tcg];
  }
}
