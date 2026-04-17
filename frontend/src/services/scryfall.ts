import axios from 'axios';
import type { ExternalCard, ExternalEdition } from '../types';

const SCRYFALL_BASE = (import.meta.env.VITE_SCRYFALL_BASE as string) || 'https://api.scryfall.com';

function scryfallCardToExternal(card: any): ExternalCard {
  const setCode = (card.set as string | undefined) || '';
  const setName = (card.set_name as string | undefined) || '';
  const prices = (card.prices as Record<string, string | null> | undefined) || {};
  const imageUris = (card.image_uris as Record<string, string> | undefined) || (card.card_faces?.[0]?.image_uris as Record<string,string>|undefined);
  const imageUrl = imageUris?.normal || imageUris?.large || imageUris?.small;

  const colorIdentity = Array.isArray(card.color_identity) ? (card.color_identity as string[]).join('') : undefined;
  const tags: string[] = [];
  if (Array.isArray(card.keywords)) tags.push(...(card.keywords as string[]));
  if (card.type_line) tags.push(...String(card.type_line).split(' — ').map((t: string) => t.trim()));

  const usd = prices.usd ? parseFloat(prices.usd) : undefined;
  const usdFoil = prices.usd_foil ? parseFloat(prices.usd_foil) : undefined;
  const usdEtched = prices.usd_etched ? parseFloat(prices.usd_etched) : undefined;
  const preferredMarket = usd ?? usdFoil ?? usdEtched;

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
    priceLow: usdFoil ?? usdEtched,
    priceMid: usd,
    priceMarket: preferredMarket,
  } as ExternalCard;
}

export async function searchCards(query: string, page = 1, limit = 50): Promise<ExternalCard[]> {
  try {
    const { data } = await axios.get(`${SCRYFALL_BASE}/cards/search`, {
      params: { q: query, page, order: 'name' },
      timeout: 20000,
    });
    if (!data || !Array.isArray(data.data)) return [];
    const cards = (data.data as any[]).map(scryfallCardToExternal);
    return limit ? cards.slice(0, limit) : cards;
  } catch (err) {
    return [];
  }
}

export async function getCardById(id: string): Promise<ExternalCard | null> {
  try {
    const { data } = await axios.get(`${SCRYFALL_BASE}/cards/${encodeURIComponent(id)}`, { timeout: 20000 });
    return scryfallCardToExternal(data as any);
  } catch {
    return null;
  }
}

export async function listSets(): Promise<ExternalEdition[]> {
  try {
    const { data } = await axios.get(`${SCRYFALL_BASE}/sets`, { timeout: 20000 });
    if (!data || !Array.isArray(data.data)) return [];
    return (data.data as any[]).map((s: any) => ({
      code: String(s.code || '').toUpperCase(),
      name: s.name as string,
      releaseDate: s.released_at as string | undefined,
      totalCards: s.card_count as number | undefined,
      source: 'scryfall',
    } as ExternalEdition));
  } catch {
    return [];
  }
}

export async function getSetCards(setCode: string, maxPages = 5): Promise<ExternalCard[]> {
  const all: ExternalCard[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= maxPages) {
    try {
      const { data } = await axios.get(`${SCRYFALL_BASE}/cards/search`, {
        params: { q: `set:${setCode.toLowerCase()}`, page, order: 'collector_number' },
        timeout: 20000,
      });
      if (!data || !Array.isArray(data.data)) break;
      all.push(...(data.data as any[]).map(scryfallCardToExternal));
      hasMore = data.has_more === true;
      page++;
    } catch {
      break;
    }
  }
  return all;
}

export default { searchCards, getCardById, listSets, getSetCards };
