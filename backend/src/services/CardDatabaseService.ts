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
  source: 'scryfall' | 'pokemontcg' | 'ygoprodeck';
  tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH';
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
  source: 'scryfall' | 'pokemontcg' | 'ygoprodeck';
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
      });
      const cards = (data.data as Record<string, unknown>[]).map(scryfallCardToExternal);
      await cacheSet(cacheKey, cards, CACHE_TTL);
      return cards;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 404) return [];
      throw err;
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
      const { data } = await axios.get(`${SCRYFALL_BASE}/cards/named`, { params });
      const card = scryfallCardToExternal(data as Record<string, unknown>);
      await cacheSet(cacheKey, card, CACHE_TTL);
      return card;
    } catch {
      return null;
    }
  }

  static async getCardById(scryfallId: string): Promise<ExternalCard | null> {
    const cacheKey = `scryfall:id:${scryfallId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalCard;

    try {
      await sleep(SCRYFALL_DELAY_MS);
      const { data } = await axios.get(`${SCRYFALL_BASE}/cards/${scryfallId}`);
      const card = scryfallCardToExternal(data as Record<string, unknown>);
      await cacheSet(cacheKey, card, CACHE_TTL);
      return card;
    } catch {
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
        });
        allCards.push(...(data.data as Record<string, unknown>[]).map(scryfallCardToExternal));
        hasMore = data.has_more === true;
        page++;
      } catch {
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
      const { data } = await axios.get(`${SCRYFALL_BASE}/sets`);
      const sets: ExternalEdition[] = (data.data as Record<string, unknown>[]).map((s) => ({
        code: String(s.code).toUpperCase(),
        name: s.name as string,
        releaseDate: s.released_at as string | undefined,
        totalCards: s.card_count as number | undefined,
        source: 'scryfall' as const,
      }));
      await cacheSet(cacheKey, sets, CACHE_TTL);
      return sets;
    } catch {
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
      });
      const cards = (data.data as Record<string, unknown>[]).map(pokemonCardToExternal);
      await cacheSet(cacheKey, cards, CACHE_TTL);
      return cards;
    } catch {
      return [];
    }
  }

  static async getCardById(cardId: string): Promise<ExternalCard | null> {
    const cacheKey = `pokemontcg:id:${cardId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalCard;

    try {
      const { data } = await axios.get(`${POKEMON_BASE}/cards/${cardId}`, { headers: this.headers() });
      const card = pokemonCardToExternal(data.data as Record<string, unknown>);
      await cacheSet(cacheKey, card, CACHE_TTL);
      return card;
    } catch {
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

      while (hasMore) {
        const { data } = await axios.get(`${POKEMON_BASE}/cards`, {
          params: { q: `set.id:${setId}`, page, pageSize: 250 },
          headers: this.headers(),
        });
        const cards = (data.data as Record<string, unknown>[]).map(pokemonCardToExternal);
        allCards.push(...cards);
        hasMore = data.page * data.pageSize < data.totalCount;
        page++;
        if (page > 10) break; // safety cap
      }

      if (allCards.length > 0) {
        await cacheSet(cacheKey, allCards, CACHE_TTL);
      }
      return allCards;
    } catch {
      return [];
    }
  }

  static async listSets(): Promise<ExternalEdition[]> {
    const cacheKey = 'pokemontcg:sets';
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalEdition[];

    try {
      const { data } = await axios.get(`${POKEMON_BASE}/sets`, { headers: this.headers() });
      const sets: ExternalEdition[] = (data.data as Record<string, unknown>[]).map((s) => ({
        code: String(s.id || '').toUpperCase(),
        name: s.name as string,
        releaseDate: s.releaseDate as string | undefined,
        totalCards: (s.total as number | undefined) || (s.printedTotal as number | undefined),
        source: 'pokemontcg' as const,
      }));
      await cacheSet(cacheKey, sets, CACHE_TTL);
      return sets;
    } catch {
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

function ygoCardToExternal(card: Record<string, unknown>, setFilter?: string): ExternalCard {
  const cardSets = (card.card_sets as YgoCardSet[] | undefined) || [];
  const images = (card.card_images as Array<Record<string, string>> | undefined) || [];
  const prices = (card.card_prices as Array<Record<string, string>> | undefined) || [];

  // Pick the set matching the filter, or the first one
  const matchSet = setFilter
    ? cardSets.find((s) => s.set_code?.toLowerCase() === setFilter.toLowerCase()) || cardSets[0]
    : cardSets[0];

  const editionCode = matchSet?.set_code?.toUpperCase() || 'UNKNOWN';
  const editionName = matchSet?.set_name || 'Unknown Set';
  const rarity = matchSet?.set_rarity;

  const imageUrl = images[0]?.image_url;
  const priceEntry = prices[0] || {};
  const priceMarket = priceEntry.tcgplayer_price ? parseFloat(priceEntry.tcgplayer_price) : undefined;
  const priceLow = priceEntry.cardmarket_price ? parseFloat(priceEntry.cardmarket_price) : undefined;

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
  static async searchCards(name: string, setCode?: string): Promise<ExternalCard[]> {
    const cacheKey = `ygopro:search:${name}:${setCode || ''}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalCard[];

    try {
      const params: Record<string, string> = { fname: name };
      if (setCode) params.cardset = setCode;
      const { data } = await axios.get(`${YGOPRO_BASE}/cardinfo.php`, { params });
      const cards = (data.data as Record<string, unknown>[]).map((c) => ygoCardToExternal(c, setCode));
      await cacheSet(cacheKey, cards, CACHE_TTL);
      return cards;
    } catch {
      return [];
    }
  }

  static async getCardById(cardId: string): Promise<ExternalCard | null> {
    const cacheKey = `ygopro:id:${cardId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalCard;

    try {
      const { data } = await axios.get(`${YGOPRO_BASE}/cardinfo.php`, { params: { id: cardId } });
      const rawCards = data.data as Record<string, unknown>[];
      if (!rawCards?.length) return null;
      const card = ygoCardToExternal(rawCards[0]);
      await cacheSet(cacheKey, card, CACHE_TTL);
      return card;
    } catch {
      return null;
    }
  }

  static async getSetCards(setName: string): Promise<ExternalCard[]> {
    const cacheKey = `ygopro:set:${setName}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalCard[];

    try {
      const { data } = await axios.get(`${YGOPRO_BASE}/cardinfo.php`, {
        params: { cardset: setName },
      });
      const cards = (data.data as Record<string, unknown>[]).map((c) => ygoCardToExternal(c, setName));
      if (cards.length > 0) {
        await cacheSet(cacheKey, cards, CACHE_TTL);
      }
      return cards;
    } catch {
      return [];
    }
  }

  static async listSets(): Promise<ExternalEdition[]> {
    const cacheKey = 'ygopro:sets';
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as ExternalEdition[];

    try {
      const { data } = await axios.get(`${YGOPRO_BASE}/cardsets.php`);
      const sets: ExternalEdition[] = (data as Record<string, unknown>[]).map((s) => ({
        code: String(s.set_code || '').toUpperCase(),
        name: s.set_name as string,
        releaseDate: s.tcg_date as string | undefined,
        totalCards: s.num_of_cards as number | undefined,
        source: 'ygoprodeck' as const,
      }));
      await cacheSet(cacheKey, sets, CACHE_TTL);
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
    tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH',
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
      default:
        return [];
    }
  }

  static async getCardById(
    tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH',
    cardId: string,
  ): Promise<ExternalCard | null> {
    switch (tcg) {
      case 'MAGIC':
        return ScryfallService.getCardById(cardId);
      case 'POKEMON':
        return PokemonTCGService.getCardById(cardId);
      case 'YUGIOH':
        return YGOProDeckService.getCardById(cardId);
      default:
        return null;
    }
  }

  static async getSetCards(
    tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH',
    setCode: string,
  ): Promise<ExternalCard[]> {
    switch (tcg) {
      case 'MAGIC':
        return ScryfallService.getSetCards(setCode);
      case 'POKEMON':
        return PokemonTCGService.getSetCards(setCode);
      case 'YUGIOH':
        return YGOProDeckService.getSetCards(setCode);
      default:
        return [];
    }
  }

  static async listSets(tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH'): Promise<ExternalEdition[]> {
    switch (tcg) {
      case 'MAGIC':
        return ScryfallService.listSets();
      case 'POKEMON':
        return PokemonTCGService.listSets();
      case 'YUGIOH':
        return YGOProDeckService.listSets();
      default:
        return [];
    }
  }
}
