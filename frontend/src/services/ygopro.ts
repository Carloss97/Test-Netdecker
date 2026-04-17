import axios from 'axios';
import type { ExternalCard, ExternalEdition } from '../types';

const YGOPRO_BASE = (import.meta.env.VITE_YGOPRO_BASE as string) || 'https://db.ygoprodeck.com/api/v7';

function extractYgoPrice(priceEntry: any): number | undefined {
  const prices = [priceEntry.tcgplayer_price, priceEntry.cardmarket_price, priceEntry.coolstuffinc_price, priceEntry.ebay_price, priceEntry.amazon_price];
  for (const v of prices) {
    if (v && typeof v === 'string') {
      const p = parseFloat(v);
      if (!isNaN(p)) return p;
    }
  }
  return undefined;
}

function extractYgoSetCodePrefix(cardSetCode: string): string {
  const raw = String(cardSetCode || '').trim();
  if (!raw) return '';

  // Prefer a compact uppercase prefix. Cover common YGOPRO suffix patterns:
  // - EN, EN1, EN01, -1, -12, -ABC123 etc. Try progressively wider matches.
  // Examples: 'DASA-EN', 'DASA-EN01', 'BLAR-1' -> 'DASA', 'DASA', 'BLAR'
  const upper = raw.toUpperCase();

  // Pattern: prefix - letters(1-3) numbers(optional), e.g. '-EN', '-EN01'
  let m = upper.match(/^(.*?)-[A-Z]{1,3}\d*$/);
  if (m && m[1]) return m[1];

  // Pattern: prefix - digits, e.g. '-1', '-12'
  m = upper.match(/^(.*?)-\d+$/);
  if (m && m[1]) return m[1];

  // Fallback: remove any non-alphanumeric and return uppercase compact form
  return upper.replace(/[^A-Z0-9]/g, '');
}

function ygoCardToExternal(card: any, setFilter?: string): ExternalCard {
  const cardSets = (card.card_sets as any[] | undefined) || [];
  const images = (card.card_images as any[] | undefined) || [];
  const prices = (card.card_prices as any[] | undefined) || [];

  const normalizedFilter = setFilter?.trim().toLowerCase();

  const matchSet = normalizedFilter
    ? cardSets.find((s) => {
        const code = (s.set_code || '').trim();
        const prefix = extractYgoSetCodePrefix(code).toLowerCase();
        return prefix === normalizedFilter || (s.set_name || '').trim().toLowerCase() === normalizedFilter;
      }) || cardSets[0]
    : cardSets[0];

  const editionCode = setFilter ? setFilter.trim().toUpperCase() : (matchSet?.set_code ? extractYgoSetCodePrefix(matchSet.set_code) : 'UNKNOWN');
  const editionName = matchSet?.set_name || setFilter || 'Unknown Set';
  const rarity = matchSet?.set_rarity;
  const imageUrl = images[0]?.image_url;
  const priceEntry = prices[0] || {};
  const priceMarket = extractYgoPrice(priceEntry);

  const types: string[] = [];
  if (card.type) types.push(card.type);
  if (card.race) types.push(card.race);

  return {
    externalId: String(card.id),
    source: 'ygoprodeck',
    tcg: 'YUGIOH',
    cardName: card.name as string,
    cardNumber: matchSet?.set_code ?? undefined,
    editionCode,
    editionName,
    rarity,
    colorIdentity: (card.attribute as string | undefined) || undefined,
    imageUrl,
    description: card.desc as string | undefined,
    tags: types.join('|'),
    priceLow: priceEntry.cardmarket_price ? parseFloat(priceEntry.cardmarket_price) : undefined,
    priceMarket,
  } as ExternalCard;
}

export async function searchCards(name: string, setCode?: string): Promise<ExternalCard[]> {
  try {
    const params: any = { fname: name };
    if (setCode) params.cardset = setCode;
    const { data } = await axios.get(`${YGOPRO_BASE}/cardinfo.php`, { params, timeout: 20000 });
    if (!data || !Array.isArray(data.data)) return [];
    return (data.data as any[]).map((c) => ygoCardToExternal(c, setCode));
  } catch {
    return [];
  }
}

export async function getCardById(cardId: string): Promise<ExternalCard | null> {
  try {
    const { data } = await axios.get(`${YGOPRO_BASE}/cardinfo.php`, { params: { id: cardId }, timeout: 20000 });
    if (!data || !Array.isArray(data.data) || data.data.length === 0) return null;
    return ygoCardToExternal(data.data[0]);
  } catch {
    return null;
  }
}

export async function listSets(): Promise<ExternalEdition[]> {
  try {
    const { data } = await axios.get(`${YGOPRO_BASE}/cardsets.php`, { timeout: 20000 });
    if (!Array.isArray(data)) return [];
    return (data as any[]).map((s) => ({ code: String(s.set_code || '').toUpperCase(), name: s.set_name, releaseDate: s.tcg_date, totalCards: s.num_of_cards, source: 'ygoprodeck' } as ExternalEdition));
  } catch {
    return [];
  }
}

export async function getSetCards(setNameOrCode: string): Promise<ExternalCard[]> {
  try {
    const { data } = await axios.get(`${YGOPRO_BASE}/cardinfo.php`, { params: { cardset: setNameOrCode }, timeout: 20000 });
    if (!data || !Array.isArray(data.data)) return [];
    return (data.data as any[]).map((c) => ygoCardToExternal(c, setNameOrCode));
  } catch {
    return [];
  }
}

export default { searchCards, getCardById, listSets, getSetCards };
