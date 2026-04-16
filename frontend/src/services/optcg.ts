import axios from 'axios';
import type { ExternalCard, ExternalEdition } from '../types';

const OPTCG_BASE = (import.meta.env.VITE_OPTCG_BASE as string) || 'https://www.optcgapi.com/api';

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
  const cardName = (card.card_name || '').trim() || 'Unknown Card';
  return {
    externalId: card.card_set_id || String(card.set_id) || 'unknown',
    source: 'onepiecetcg',
    tcg: 'ONE_PIECE',
    cardName,
    editionCode: (card.set_id || '').toUpperCase(),
    editionName: card.set_name || 'Unknown Set',
    rarity: card.rarity,
    imageUrl: card.card_image,
    description: card.card_text,
    tags: `rarity:${card.rarity}`,
    priceLow: inventoryPrice,
    priceMarket: marketPrice,
  } as ExternalCard;
}

export async function getAllCards(): Promise<ExternalCard[]> {
  try {
    const { data } = await axios.get(`${OPTCG_BASE}/allSetCards/`, { timeout: 30000 });
    if (!Array.isArray(data)) return [];
    return (data as OptcgResponse[]).map(optcgCardToExternal).filter((c) => c.cardName && c.cardName !== 'Unknown Card');
  } catch {
    return [];
  }
}

export async function searchCards(query: string): Promise<ExternalCard[]> {
  try {
    const all = await getAllCards();
    return all.filter((c) => c.cardName.toLowerCase().includes(query.toLowerCase()));
  } catch {
    return [];
  }
}

export async function getCardById(cardId: string): Promise<ExternalCard | null> {
  try {
    const all = await getAllCards();
    const found = all.find((c) => c.externalId === cardId);
    return found || null;
  } catch {
    return null;
  }
}

export async function listSets(): Promise<ExternalEdition[]> {
  try {
    const all = await getAllCards();
    const setsMap = new Map<string, { name: string; code: string }>();
    all.forEach((card) => {
      if (!setsMap.has(card.editionCode)) setsMap.set(card.editionCode, { code: card.editionCode, name: card.editionName });
    });
    return Array.from(setsMap.values()).map((s) => ({ code: s.code, name: s.name, source: 'onepiecetcg' as const } as ExternalEdition));
  } catch {
    return [];
  }
}

export async function getSetCards(setId: string): Promise<ExternalCard[]> {
  try {
    const all = await getAllCards();
    return all.filter((c) => c.editionCode.toUpperCase() === setId.toUpperCase());
  } catch {
    return [];
  }
}

export default { getAllCards, searchCards, getCardById, listSets, getSetCards };
