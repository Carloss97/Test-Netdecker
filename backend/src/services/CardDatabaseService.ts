// src/services/CardDatabaseService.ts
// Integrations with free external card databases:
//   - Scryfall (Magic: The Gathering) — https://scryfall.com/docs/api
//   - Pokémon TCG API         — https://pokemontcg.io/
//   - YGOPRODeck API          — https://ygoprodeck.com/api-guide/

import axios from 'axios';
import { cacheGet, cacheSet } from '../utils/redis.js';

// ─────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────

export interface ExternalCard {
  externalId: string;       // ID in the source database
  source: 'scryfall' | 'pokemontcg' | 'ygoprodeck' | 'onepiecetcg';
  tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE';
  cardName: string;
  cardNumber?: string;
  editionCode: string;
  editionName: string;
  rarity?: string;
  colorIdentity?: string;   // MTG color identity; generic category for others
  imageUrl?: string;
  description?: string;
  tags?: string;
  // Price fields (USD market price when available)
  priceLow?: number;
  priceMid?: number;
  priceMarket?: number;
}

export interface ExternalEdition {
  code: string;
  name: string;
  releaseDate?: string;
  totalCards?: number;
  source: 'scryfall' | 'pokemontcg' | 'ygoprodeck' | 'onepiecetcg';
}

const CACHE_TTL = 3600 * 3; // 3 hours

// ─────────────────────────────────────────────
// Scryfall (Magic: The Gathering)
// ─────────────────────────────────────────────

const SCRYFALL_BASE = 'https://api.scryfall.com';
const SCRYFALL_DELAY_MS = 100; // Scryfall requests ~50–100 ms delay recommended

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scryfallCardToExternal(card: Record<string, unknown>): ExternalCard {
  const setCode = (card.set as string | undefined) || '';
  const setName = (card.set_name as string | undefined) || '';
  const prices = (card.prices as Record<string, string | null> | undefined) || {};
  const imageUris = (card.image_uris as Record<string, string> | undefined);
  const cardFaces = (card.card_faces as Array<Record<string, unknown>> | undefined);
  const imageUrl =
    imageUris?.normal ||
    (cardFaces?.[0]?.image_uris as Record<string, string> | undefined)?.normal;

  const colorIdentity = Array.isArray(card.color_identity)
    ? (card.color_identity as string[]).join('')
    : undefined;

  const tags: string[] = [];
  if (Array.isArray(card.keywords)) tags.push(...(card.keywords as string[]));
  if (card.type_line) tags.push(...String(card.type_line).split(' — ').map((t) => t.trim()));

  return {
    externalId: card.id as string,
    source: 'scryfall',
    tcg: 'MAGIC',
    cardName: card.name as string,
    cardNumber: card.collector_number as string | undefined,
    editionCode: setCode.toUpperCase(),
    editionName: setName,
    rarity: card.rarity as string | undefined,
    colorIdentity,
    imageUrl,
    description: card.oracle_text as string | undefined,
    tags: tags.join('|'),
    priceLow: prices.usd_foil ? parseFloat(prices.usd_foil) : undefined,
    priceMid: prices.usd ? parseFloat(prices.usd) : undefined,
    priceMarket: prices.usd ? parseFloat(prices.usd) : undefined,
  };
}

export class ScryfallService {
  static async searchCards(query: string, page = 1): Promise<ExternalCard[]> {
    const cacheKey = `scryfall:search:${query}:${page}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalCard[];

    try {
      await sleep(SCRYFALL_DELAY_MS);
      const { data } = await axios.get(`${SCRYFALL_BASE}/cards/search`, {
        params: { q: query, page, order: 'name' },
        timeout: 30000,
      });
      if (!data || !Array.isArray(data.data)) {
        console.warn('[Scryfall] searchCards: Invalid response structure');
        return [];
      }
      const cards = (data.data as Record<string, unknown>[]).map(scryfallCardToExternal);
      await cacheSet(cacheKey, cards, CACHE_TTL);
      return cards;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 404) return [];
      console.error('[Scryfall] searchCards error:', (err as Error).message);
      return [];
    }
  }

  static async getCardByName(name: string, setCode?: string): Promise<ExternalCard | null> {
    const cacheKey = `scryfall:named:${name}:${setCode || ''}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalCard;

    try {
      await sleep(SCRYFALL_DELAY_MS);
      const params: Record<string, string> = { exact: name };
      if (setCode) params.set = setCode.toLowerCase();
      const { data } = await axios.get(`${SCRYFALL_BASE}/cards/named`, { params, timeout: 30000 });
      const card = scryfallCardToExternal(data as Record<string, unknown>);
      await cacheSet(cacheKey, card, CACHE_TTL);
      return card;
    } catch (err: unknown) {
      console.error('[Scryfall] getCardByName error:', (err as Error).message);
      return null;
    }
  }

  static async getCardById(scryfallId: string): Promise<ExternalCard | null> {
    // Scryfall IDs are UUIDs — validate to prevent path-traversal SSRF
    if (!/^[0-9a-f-]{36}$/i.test(scryfallId)) {
      return null;
    }
    const safeId = encodeURIComponent(scryfallId);
    const cacheKey = `scryfall:id:${safeId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalCard;

    try {
      await sleep(SCRYFALL_DELAY_MS);
      const { data } = await axios.get(`${SCRYFALL_BASE}/cards/${safeId}`, { timeout: 30000 });
      const card = scryfallCardToExternal(data as Record<string, unknown>);
      await cacheSet(cacheKey, card, CACHE_TTL);
      return card;
    } catch (err: unknown) {
      console.error('[Scryfall] getCardById error:', (err as Error).message);
      return null;
    }
  }

  static async getSetCards(setCode: string, maxPages = 5): Promise<ExternalCard[]> {
    const cacheKey = `scryfall:set:${setCode.toLowerCase()}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalCard[];

    const allCards: ExternalCard[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= maxPages) {
      try {
        await sleep(SCRYFALL_DELAY_MS);
        const { data } = await axios.get(`${SCRYFALL_BASE}/cards/search`, {
          params: { q: `set:${setCode.toLowerCase()}`, page, order: 'collector_number' },
          timeout: 30000,
        });
        if (!data || !Array.isArray(data.data)) {
          console.warn(`[Scryfall] getSetCards ${setCode} page ${page}: Invalid response structure`);
          hasMore = false;
          break;
        }
        allCards.push(...(data.data as Record<string, unknown>[]).map(scryfallCardToExternal));
        hasMore = data.has_more === true;
        page++;
      } catch (err: unknown) {
        console.error(`[Scryfall] getSetCards ${setCode} page ${page} error:`, (err as Error).message);
        hasMore = false;
      }
    }

    if (allCards.length > 0) {
      await cacheSet(cacheKey, allCards, CACHE_TTL);
    }
    return allCards;
  }

  static async listSets(): Promise<ExternalEdition[]> {
    const cacheKey = 'scryfall:sets';
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalEdition[];

    try {
      await sleep(SCRYFALL_DELAY_MS);
      const { data } = await axios.get(`${SCRYFALL_BASE}/sets`, { timeout: 30000 });
      if (!data || !Array.isArray(data.data)) {
        console.warn('[Scryfall] listSets: Invalid response structure');
        return [];
      }
      const sets: ExternalEdition[] = (data.data as Record<string, unknown>[]).map((s) => ({
        code: String(s.code).toUpperCase(),
        name: s.name as string,
        releaseDate: s.released_at as string | undefined,
        totalCards: s.card_count as number | undefined,
        source: 'scryfall' as const,
      }));
      await cacheSet(cacheKey, sets, CACHE_TTL);
      return sets;
    } catch (err: unknown) {
      console.error('[Scryfall] listSets error:', (err as Error).message);
      return [];
    }
  }
}

// ─────────────────────────────────────────────
// Pokémon TCG API  (https://pokemontcg.io/)
// ─────────────────────────────────────────────

const POKEMON_BASE = 'https://api.pokemontcg.io/v2';

function pokemonCardToExternal(card: Record<string, unknown>): ExternalCard {
  const set = (card.set as Record<string, unknown> | undefined) || {};
  const images = (card.images as Record<string, string> | undefined) || {};
  const tcgplayer = (card.tcgplayer as Record<string, unknown> | undefined);
  const prices = tcgplayer?.prices as Record<string, Record<string, number>> | undefined;

  const normalPrices = prices?.normal || prices?.holofoil || {};
  const priceLow = normalPrices.low;
  const priceMid = normalPrices.mid;
  const priceMarket = normalPrices.market;

  const subtypes = Array.isArray(card.subtypes) ? (card.subtypes as string[]) : [];
  const supertypes = Array.isArray(card.supertypes) ? (card.supertypes as string[]) : [];
  const types = Array.isArray(card.types) ? (card.types as string[]) : [];

  const tags = [...supertypes, ...subtypes, ...types].join('|');

  return {
    externalId: card.id as string,
    source: 'pokemontcg',
    tcg: 'POKEMON',
    cardName: card.name as string,
    cardNumber: card.number as string | undefined,
    editionCode: String(set.id || '').toUpperCase(),
    editionName: String(set.name || ''),
    rarity: card.rarity as string | undefined,
    colorIdentity: types.join('/'),
    imageUrl: images.large || images.small,
    description: Array.isArray(card.abilities)
      ? (card.abilities as Array<{ text?: string }>).map((a) => a.text).join(' ')
      : undefined,
    tags,
    priceLow,
    priceMid,
    priceMarket,
  };
}

export class PokemonTCGService {
  private static headers(): Record<string, string> {
    const key = process.env.POKEMON_TCG_API_KEY;
    return key ? { 'X-Api-Key': key } : {};
  }

  static async searchCards(name: string, setId?: string, page = 1, pageSize = 20): Promise<ExternalCard[]> {
    const cacheKey = `pokemontcg:search:${name}:${setId || ''}:${page}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalCard[];

    try {
      const query = setId ? `name:"${name}" set.id:${setId}` : `name:"${name}"`;
      const { data } = await axios.get(`${POKEMON_BASE}/cards`, {
        params: { q: query, page, pageSize },
        headers: this.headers(),
        timeout: 10000,
      });
      if (!data || !Array.isArray(data.data)) {
        console.warn('[PokemonTCG] searchCards: Invalid response structure');
        return [];
      }
      const cards = (data.data as Record<string, unknown>[]).map(pokemonCardToExternal);
      await cacheSet(cacheKey, cards, CACHE_TTL);
      return cards;
    } catch (err: unknown) {
      console.error('[PokemonTCG] searchCards error:', (err as Error).message);
      return [];
    }
  }

  static async getCardById(cardId: string): Promise<ExternalCard | null> {
    // Pokémon TCG card IDs follow format like "sv1-001" or "base1-4" — alphanumeric + hyphens
    if (!/^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?$/i.test(cardId)) {
      return null;
    }
    const safeId = encodeURIComponent(cardId);
    const cacheKey = `pokemontcg:id:${safeId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalCard;

    try {
      const { data } = await axios.get(`${POKEMON_BASE}/cards/${safeId}`, {
        headers: this.headers(),
        timeout: 10000,
      });
      if (!data || !data.data) {
        console.warn('[PokemonTCG] getCardById: Invalid response structure');
        return null;
      }
      const card = pokemonCardToExternal(data.data as Record<string, unknown>);
      await cacheSet(cacheKey, card, CACHE_TTL);
      return card;
    } catch (err: unknown) {
      console.error('[PokemonTCG] getCardById error:', (err as Error).message);
      return null;
    }
  }

  static async getSetCards(setId: string): Promise<ExternalCard[]> {
    const cacheKey = `pokemontcg:set:${setId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalCard[];

    try {
      const allCards: ExternalCard[] = [];
      let page = 1;
      let hasMore = true;
      let totalCards = 0;

      while (hasMore) {
        try {
          const { data } = await axios.get(`${POKEMON_BASE}/cards`, {
            params: { q: `set.id:${setId}`, page, pageSize: 250 },
            headers: this.headers(),
            timeout: 10000, // 10 second timeout
          });

          if (!data || !Array.isArray(data.data)) {
            console.warn(
              `[PokemonTCG] Invalid response for set ${setId} page ${page}: missing data.data`,
            );
            break;
          }

          const cards = (data.data as Record<string, unknown>[])
            .map(pokemonCardToExternal);

          // Count cards with missing prices for debugging
          const missingPrices = cards.filter(c =>
            c.priceMarket === undefined && c.priceMid === undefined && c.priceLow === undefined
          ).length;
          if (missingPrices > 0) {
            console.warn(`[PokemonTCG] Set ${setId} page ${page}: ${missingPrices} cards have no pricing data (will be imported)`);
          }

          allCards.push(...cards);
          totalCards = data.totalCount || 0;
          hasMore = (data.page || page) * (data.pageSize || 250) < totalCards;
          page++;

          if (page > 10) {
            console.warn(`[PokemonTCG] Set ${setId}: Hit safety cap at page 10. Total cards so far: ${allCards.length}`);
            break;
          }
        } catch (pageErr) {
          const msg = pageErr instanceof Error ? pageErr.message : String(pageErr);
          console.error(`[PokemonTCG] Error fetching set ${setId} page ${page}: ${msg}`);
          // Continue to next set rather than failing entire batch
          break;
        }
      }

      if (allCards.length === 0) {
        console.warn(`[PokemonTCG] No valid cards found for set ${setId}`);
      } else {
        await cacheSet(cacheKey, allCards, CACHE_TTL);
      }
      return allCards;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[PokemonTCG] Fatal error fetching set cards for ${setId}: ${msg}`);
      return [];
    }
  }

  static async listSets(): Promise<ExternalEdition[]> {
    const cacheKey = 'pokemontcg:sets';
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalEdition[];

    try {
      const { data } = await axios.get(`${POKEMON_BASE}/sets`, {
        headers: this.headers(),
        timeout: 15000,
      });
      if (!data || !Array.isArray(data.data)) {
        console.warn('[PokemonTCG] listSets: Invalid response structure');
        return [];
      }
      const sets: ExternalEdition[] = (data.data as Record<string, unknown>[]).map((s) => ({
        code: String(s.id || '').toUpperCase(),
        name: s.name as string,
        releaseDate: s.releaseDate as string | undefined,
        totalCards: (s.total as number | undefined) || (s.printedTotal as number | undefined),
        source: 'pokemontcg' as const,
      }));
      await cacheSet(cacheKey, sets, CACHE_TTL);
      return sets;
    } catch (err: unknown) {
      console.error('[PokemonTCG] listSets error:', (err as Error).message);
      return [];
    }
  }
}

// ─────────────────────────────────────────────
// YGOPRODeck API  (https://ygoprodeck.com/api-guide/)
// ─────────────────────────────────────────────

const YGOPRO_BASE = 'https://db.ygoprodeck.com/api/v7';

interface YgoCardSet {
  set_name?: string;
  set_code?: string;
  set_rarity?: string;
  set_price?: string;
}

interface YgoPrice {
  cardmarket_price?: string;
  tcgplayer_price?: string;
  coolstuffinc_price?: string;
  ebay_price?: string;
  amazon_price?: string;
}

/**
 * Extract best price from YGOPRODeck multi-source pricing.
 * Priority: TCGPlayer > CardMarket > CoolStuffInc > eBay > Amazon
 * If TCGPlayer unavailable: use CardMarket (EUR) with fallback to others
 */
function extractYgoPrice(priceEntry: YgoPrice | Record<string, unknown>): number | undefined {
  const prices = [
    { source: 'TCGPlayer', value: priceEntry.tcgplayer_price },
    { source: 'CardMarket', value: priceEntry.cardmarket_price },
    { source: 'CoolStuffInc', value: priceEntry.coolstuffinc_price },
    { source: 'eBay', value: priceEntry.ebay_price },
    { source: 'Amazon', value: priceEntry.amazon_price },
  ];

  for (const { value } of prices) {
    if (value && typeof value === 'string') {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) return parsed;
    }
  }
  return undefined;
}

function ygoCardToExternal(card: Record<string, unknown>, setFilter?: string): ExternalCard {
  const cardSets = (card.card_sets as YgoCardSet[] | undefined) || [];
  const images = (card.card_images as Array<Record<string, string>> | undefined) || [];
  const prices = (card.card_prices as Array<Record<string, string>> | undefined) || [];

  const normalizedFilter = setFilter?.trim().toLowerCase();

  // Pick the set matching the filter, or the first one
  const matchSet = normalizedFilter
    ? cardSets.find(
        (s) =>
          s.set_code?.trim().toLowerCase() === normalizedFilter ||
          s.set_name?.trim().toLowerCase() === normalizedFilter,
      ) || cardSets[0]
    : cardSets[0];

  const editionCode = matchSet?.set_code?.toUpperCase() || 'UNKNOWN';
  const editionName = matchSet?.set_name || 'Unknown Set';
  const rarity = matchSet?.set_rarity;

  const imageUrl = images[0]?.image_url;
  const priceEntry = (prices[0] || {}) as Record<string, unknown>;

  // Use multi-source price extraction: priority TCGPlayer > CardMarket > others
  const priceMarket = extractYgoPrice(priceEntry);
  const priceLow = priceEntry.cardmarket_price ? parseFloat(priceEntry.cardmarket_price as string) : undefined;

  const types: string[] = [];
  if (card.type) types.push(card.type as string);
  if (card.race) types.push(card.race as string);

  return {
    externalId: String(card.id),
    source: 'ygoprodeck',
    tcg: 'YUGIOH',
    cardName: card.name as string,
    editionCode,
    editionName,
    rarity,
    colorIdentity: (card.attribute as string | undefined) || undefined,
    imageUrl,
    description: card.desc as string | undefined,
    tags: types.join('|'),
    priceLow,
    priceMarket,
  };
}

export class YGOProDeckService {
  private static async resolveSetName(setCodeOrName: string): Promise<string> {
    const normalized = setCodeOrName.trim().toLowerCase();
    if (!normalized) return setCodeOrName;

    const sets = await this.listSets();
    const match = sets.find(
      (set) =>
        set.code.trim().toLowerCase() === normalized ||
        set.name.trim().toLowerCase() === normalized,
    );

    return match?.name || setCodeOrName;
  }

  static async searchCards(name: string, setCode?: string): Promise<ExternalCard[]> {
    const cacheKey = `ygopro:search:${name}:${setCode || ''}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalCard[];

    try {
      const params: Record<string, string> = { fname: name };
      if (setCode) params.cardset = await this.resolveSetName(setCode);
      const { data } = await axios.get(`${YGOPRO_BASE}/cardinfo.php`, { params, timeout: 15000 });
      if (!data || !Array.isArray(data.data)) {
        console.warn('[YGOPRODeck] searchCards: Invalid response structure');
        return [];
      }
      const cards = (data.data as Record<string, unknown>[]).map((c) => ygoCardToExternal(c, setCode));
      await cacheSet(cacheKey, cards, CACHE_TTL);
      return cards;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      const message = (err as Error).message;
      console.error(`[YGOPRODeck] searchCards error (status ${status}):`, message);
      return [];
    }
  }

  static async getCardById(cardId: string): Promise<ExternalCard | null> {
    const cacheKey = `ygopro:id:${cardId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalCard;

    try {
      const { data } = await axios.get(`${YGOPRO_BASE}/cardinfo.php`, {
        params: { id: cardId },
        timeout: 15000,
      });
      if (!data || !Array.isArray(data.data)) {
        console.warn('[YGOPRODeck] getCardById: Invalid response structure');
        return null;
      }
      const rawCards = data.data as Record<string, unknown>[];
      if (!rawCards?.length) return null;
      const card = ygoCardToExternal(rawCards[0]);
      await cacheSet(cacheKey, card, CACHE_TTL);
      return card;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      const message = (err as Error).message;
      console.error(`[YGOPRODeck] getCardById error (status ${status}):`, message);
      return null;
    }
  }

  static async getSetCards(setNameOrCode: string): Promise<ExternalCard[]> {
    const cacheKey = `ygopro:set:${setNameOrCode}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalCard[];

    try {
      const setName = await this.resolveSetName(setNameOrCode);
      console.log(`[YGOPRODeck] getSetCards: Resolved "${setNameOrCode}" → "${setName}"`);

      const { data } = await axios.get(`${YGOPRO_BASE}/cardinfo.php`, {
        params: { cardset: setName },
        timeout: 15000,
      });
      if (!data || !Array.isArray(data.data)) {
        console.warn('[YGOPRODeck] getSetCards: Invalid response structure');
        return [];
      }
      const cards = (data.data as Record<string, unknown>[]).map((c) => ygoCardToExternal(c, setNameOrCode));
      if (cards.length > 0) {
        await cacheSet(cacheKey, cards, CACHE_TTL);
      }
      return cards;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      const message = (err as Error).message;
      console.error(`[YGOPRODeck] getSetCards error for "${setNameOrCode}" (status ${status}):`, message);
      return [];
    }
  }

  static async listSets(): Promise<ExternalEdition[]> {
    const cacheKey = 'ygopro:sets';
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalEdition[];

    try {
      const { data } = await axios.get(`${YGOPRO_BASE}/cardsets.php`, { timeout: 15000 });
      if (!Array.isArray(data)) {
        console.warn('[YGOPRODeck] listSets: Invalid response structure (not an array)');
        return [];
      }
      const sets: ExternalEdition[] = (data as Record<string, unknown>[]).map((s) => ({
        code: String(s.set_code || '').toUpperCase(),
        name: s.set_name as string,
        releaseDate: s.tcg_date as string | undefined,
        totalCards: s.num_of_cards as number | undefined,
        source: 'ygoprodeck' as const,
      }));
      await cacheSet(cacheKey, sets, CACHE_TTL);
      return sets;
    } catch (err: unknown) {
      console.error('[YGOPRODeck] listSets error:', (err as Error).message);
      return [];
    }
  }
}

// ─────────────────────────────────────────────
// OPTCGAPI (One Piece TCG)  https://optcgapi.com/
// ─────────────────────────────────────────────

const OPTCG_BASE = 'https://www.optcgapi.com/api';

interface OptcgResponse {
  inventory_price?: number;
  market_price?: number;
  card_name?: string;
  set_name?: string;
  set_id?: string;
  rarity?: string;
  card_set_id?: string;
  card_image?: string;
  card_text?: string;
  date_scraped?: string;
}

function optcgCardToExternal(card: OptcgResponse): ExternalCard {
  const marketPrice = card.market_price ? parseFloat(String(card.market_price)) : undefined;
  const inventoryPrice = card.inventory_price ? parseFloat(String(card.inventory_price)) : undefined;
  // Validate required fields
  const cardName = (card.card_name || '').trim();
  if (!cardName) {
    console.warn('[OPTCGAPI] Card missing card_name, using placeholder');
  }

  return {
    externalId: card.card_set_id || String(card.set_id) || 'unknown',
    source: 'onepiecetcg',
    tcg: 'ONE_PIECE',
    cardName: cardName || 'Unknown Card',
    editionCode: card.set_id?.toUpperCase() || 'UNKNOWN',
    editionName: card.set_name || 'Unknown Set',
    rarity: card.rarity,
    imageUrl: card.card_image,
    description: card.card_text,
    tags: `rarity:${card.rarity}`,
    priceLow: inventoryPrice,
    priceMarket: marketPrice,
  };
}

export class OptcgapiService {
  private static readonly RATE_LIMIT_MS = 500; // Conservative: 2 req/sec for community API
  private static lastRequestTime = 0;

  private static async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.RATE_LIMIT_MS) {
      await sleep(this.RATE_LIMIT_MS - timeSinceLastRequest);
    }
    this.lastRequestTime = Date.now();
  }

  static async searchCards(query: string): Promise<ExternalCard[]> {
    const cacheKey = `optcg:search:${query}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalCard[];

    try {
      // Get all cards and filter by name client-side (since OPTCGAPI doesn't support search param)
      const allCards = await this.getAllCards();
      const filtered = allCards.filter((card) =>
        card.cardName.toLowerCase().includes(query.toLowerCase()),
      );

      await cacheSet(cacheKey, filtered, CACHE_TTL);
      return filtered;
    } catch (err: unknown) {
      console.error('[OPTCGAPI] searchCards error:', (err as Error).message);
      return [];
    }
  }

  static async getCardById(cardId: string): Promise<ExternalCard | null> {
    const cacheKey = `optcg:id:${cardId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalCard;

    try {
      // Get all cards and find by ID
      const allCards = await this.getAllCards();
      const card = allCards.find((c) => c.externalId === cardId);

      if (card) {
        await cacheSet(cacheKey, card, CACHE_TTL);
        return card;
      }
      return null;
    } catch (err: unknown) {
      console.error('[OPTCGAPI] getCardById error:', (err as Error).message);
      return null;
    }
  }

  static async getAllCards(): Promise<ExternalCard[]> {
    const cacheKey = 'optcg:all-cards';
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalCard[];

    try {
      await this.enforceRateLimit();
      const { data } = await axios.get(`${OPTCG_BASE}/allSetCards/`, { timeout: 30000 });

      if (!Array.isArray(data)) {
        console.warn('[OPTCGAPI] getAllCards: Response is not an array');
        return [];
      }

      const cards: ExternalCard[] = (data as OptcgResponse[])
        .map(optcgCardToExternal)
        .filter((c) => c.cardName && c.cardName !== 'Unknown Card'); // Only import valid cards

      if (cards.length > 0) {
        await cacheSet(cacheKey, cards, CACHE_TTL);
      }
      console.info(`[OPTCGAPI] getAllCards: Loaded ${cards.length} cards`);
      return cards;
    } catch (err) {
      console.error('[OPTCGAPI] getAllCards error:', err instanceof Error ? err.message : err);
      return [];
    }
  }

  static async getSetCards(setId: string): Promise<ExternalCard[]> {
    const cacheKey = `optcg:set:${setId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalCard[];

    try {
      const allCards = await this.getAllCards();
      const filtered = allCards.filter((card) => card.editionCode.toUpperCase() === setId.toUpperCase());

      if (filtered.length > 0) {
        await cacheSet(cacheKey, filtered, CACHE_TTL);
      }
      return filtered;
    } catch (err: unknown) {
      console.error('[OPTCGAPI] getSetCards error:', (err as Error).message);
      return [];
    }
  }

  static async listSets(): Promise<ExternalEdition[]> {
    const cacheKey = 'optcg:sets';
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalEdition[];

    try {
      const allCards = await this.getAllCards();
      const setsMap = new Map<string, { name: string; code: string }>();

      allCards.forEach((card) => {
        if (!setsMap.has(card.editionCode)) {
          setsMap.set(card.editionCode, { code: card.editionCode, name: card.editionName });
        }
      });

      const sets: ExternalEdition[] = Array.from(setsMap.values()).map((set) => ({
        code: set.code,
        name: set.name,
        source: 'onepiecetcg' as const,
      }));

      if (sets.length > 0) {
        await cacheSet(cacheKey, sets, CACHE_TTL);
      }
      return sets;
    } catch {
      return [];
    }
  }
}

// ─────────────────────────────────────────────
// Unified facade
// ─────────────────────────────────────────────

export class CardDatabaseService {
  static async searchCards(
    tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE',
    query: string,
    options: { setCode?: string; page?: number } = {},
  ): Promise<ExternalCard[]> {
    switch (tcg) {
      case 'MAGIC':
        return ScryfallService.searchCards(query, options.page);
      case 'POKEMON':
        return PokemonTCGService.searchCards(query, options.setCode, options.page);
      case 'YUGIOH':
        return YGOProDeckService.searchCards(query, options.setCode);
      case 'ONE_PIECE':
        return OptcgapiService.searchCards(query);
      default:
        return [];
    }
  }

  static async getCardById(
    tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE',
    cardId: string,
  ): Promise<ExternalCard | null> {
    switch (tcg) {
      case 'MAGIC':
        return ScryfallService.getCardById(cardId);
      case 'POKEMON':
        return PokemonTCGService.getCardById(cardId);
      case 'YUGIOH':
        return YGOProDeckService.getCardById(cardId);
      case 'ONE_PIECE':
        return OptcgapiService.getCardById(cardId);
      default:
        return null;
    }
  }

  static async getSetCards(
    tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE',
    setCode: string,
  ): Promise<ExternalCard[]> {
    switch (tcg) {
      case 'MAGIC':
        return ScryfallService.getSetCards(setCode);
      case 'POKEMON':
        return PokemonTCGService.getSetCards(setCode);
      case 'YUGIOH':
        return YGOProDeckService.getSetCards(setCode);
      case 'ONE_PIECE':
        return OptcgapiService.getSetCards(setCode);
      default:
        return [];
    }
  }

  static async listSets(tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE'): Promise<ExternalEdition[]> {
    switch (tcg) {
      case 'MAGIC':
        return ScryfallService.listSets();
      case 'POKEMON':
        return PokemonTCGService.listSets();
      case 'YUGIOH':
        return YGOProDeckService.listSets();
      case 'ONE_PIECE':
        return OptcgapiService.listSets();
      default:
        return [];
    }
  }
}
