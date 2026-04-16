import axios from 'axios';
import type { ExternalCard, ExternalEdition } from '../types';

const POKEMON_BASE = (import.meta.env.VITE_POKEMON_BASE as string) || 'https://api.pokemontcg.io/v2';
const API_KEY = (import.meta.env.VITE_POKEMON_TCG_API_KEY as string) || undefined;

function pokemonCardToExternal(card: any): ExternalCard {
  const set = (card.set as Record<string, unknown> | undefined) || {};
  const images = (card.images as Record<string, string> | undefined) || {};
  const tcgplayer = (card.tcgplayer as Record<string, unknown> | undefined);
  const prices = tcgplayer?.prices as Record<string, Record<string, number>> | undefined;

  const normalPrices = prices?.normal || prices?.holofoil || {};
  const priceLow = normalPrices.low as number | undefined;
  const priceMid = normalPrices.mid as number | undefined;
  const priceMarket = normalPrices.market as number | undefined;

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
    description: Array.isArray(card.abilities) ? (card.abilities as Array<{ text?: string }>).map((a)=>a.text).join(' ') : undefined,
    tags,
    priceLow,
    priceMid,
    priceMarket,
  } as ExternalCard;
}

function headers() {
  return API_KEY ? { 'X-Api-Key': API_KEY } : {};
}

export async function searchCards(name: string, setId?: string, limit = 50): Promise<ExternalCard[]> {
  try {
    const q = setId ? `name:"${name}" set.id:${setId}` : `name:"${name}"`;
    const { data } = await axios.get(`${POKEMON_BASE}/cards`, {
      params: { q, page: 1, pageSize: limit },
      headers: headers(),
      timeout: 20000,
    });
    if (!data || !Array.isArray(data.data)) return [];
    return (data.data as any[]).map(pokemonCardToExternal);
  } catch (err) {
    return [];
  }
}

export async function getCardById(id: string): Promise<ExternalCard | null> {
  try {
    const { data } = await axios.get(`${POKEMON_BASE}/cards/${encodeURIComponent(id)}`, {
      headers: headers(), timeout: 20000,
    });
    if (!data || !data.data) return null;
    return pokemonCardToExternal(data.data as any);
  } catch {
    return null;
  }
}

export async function listSets(): Promise<ExternalEdition[]> {
  try {
    const { data } = await axios.get(`${POKEMON_BASE}/sets`, { headers: headers(), timeout: 20000 });
    if (!data || !Array.isArray(data.data)) return [];
    return (data.data as any[]).map((s) => ({
      code: String(s.id || '').toUpperCase(),
      name: s.name as string,
      releaseDate: s.releaseDate as string | undefined,
      totalCards: (s.total as number) || (s.printedTotal as number) || undefined,
      source: 'pokemontcg',
    } as ExternalEdition));
  } catch {
    return [];
  }
}

export async function getSetCards(setId: string): Promise<ExternalCard[]> {
  try {
    const { data } = await axios.get(`${POKEMON_BASE}/cards`, {
      params: { q: `set.id:${setId}`, page: 1, pageSize: 250 },
      headers: headers(), timeout: 20000,
    });
    if (!data || !Array.isArray(data.data)) return [];
    return (data.data as any[]).map(pokemonCardToExternal);
  } catch {
    return [];
  }
}

export default { searchCards, getCardById, listSets, getSetCards };
