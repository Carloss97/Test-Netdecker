import axios from 'axios';
import type { ExternalCard, ExternalEdition } from '../types';

export type TCGCsvTcg = 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';

const TCGCSV_CATEGORY_IDS: Record<TCGCsvTcg, number> = {
  MAGIC: 1,
  YUGIOH: 2,
  POKEMON: 3,
  WEISS_SCHWARZ: 20,
  DIGIMON: 63,
  ONE_PIECE: 68,
};

function normalizeTcg(tcg: string): TCGCsvTcg | undefined {
  const normalized = String(tcg || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

  const aliases: Record<string, TCGCsvTcg> = {
    MAGIC: 'MAGIC',
    MTG: 'MAGIC',
    POKEMON: 'POKEMON',
    YUGIOH: 'YUGIOH',
    YU_GI_OH: 'YUGIOH',
    ONEPIECE: 'ONE_PIECE',
    ONE_PIECE: 'ONE_PIECE',
    DIGIMON: 'DIGIMON',
    WEISS_SCHWARZ: 'WEISS_SCHWARZ',
  };

  return aliases[normalized];
}

function getTcgCsvBase(): string {
  return (import.meta.env.VITE_TCGCSV_BASE as string) || 'https://tcgcsv.com/tcgplayer';
}

interface TcgCsvGroup {
  groupId: number;
  name: string;
  abbreviation?: string;
  totalCards?: number;
  cardCount?: number;
  totalItems?: number;
  productCount?: number;
  numOfCards?: number;
  isSupplemental?: boolean;
  publishedOn?: string;
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
  extendedData?: TcgCsvExtendedData[];
  subTypeName?: string;
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

function getExtendedValue(extendedData: TcgCsvExtendedData[] | undefined, fieldName: string): string | undefined {
  if (!extendedData?.length) return undefined;
  const lc = fieldName.toLowerCase();
  const entry = extendedData.find(
    (e) => (e.name || e.displayName || '').toLowerCase() === lc,
  );
  return entry?.value ?? undefined;
}

function bestPrice(p: TcgCsvPrice): number | undefined {
  const v = p.marketPrice ?? p.midPrice ?? p.lowPrice;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

function priceSubtypeRank(subTypeName?: string): number {
  const normalized = (subTypeName || '').trim().toLowerCase();
  if (normalized === 'normal') return 0;
  if (normalized === 'holofoil') return 1;
  if (normalized === 'reverse holofoil') return 2;
  return 3;
}

function pickBestPrice(prices: TcgCsvPrice[]): TcgCsvPrice | undefined {
  return [...prices].sort((left, right) => {
    const leftMarket = left.marketPrice ?? left.midPrice ?? left.lowPrice ?? -1;
    const rightMarket = right.marketPrice ?? right.midPrice ?? right.lowPrice ?? -1;

    if (rightMarket !== leftMarket) {
      return rightMarket - leftMarket;
    }

    return priceSubtypeRank(left.subTypeName) - priceSubtypeRank(right.subTypeName);
  })[0];
}

function isCardLikeProduct(product: TcgCsvProduct): boolean {
  const ext = product.extendedData ?? [];
  return ext.some((entry) => {
    const key = (entry.name || entry.displayName || '').toLowerCase();
    return key === 'rarity' || key === 'number' || key === 'cardnumber' || key === 'collectornumber';
  });
}

function normalizeSetIdentifier(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function resolveGroupBySetCode(groups: TcgCsvGroup[], setCode: string): TcgCsvGroup | undefined {
  const normalizedCode = setCode.trim().toUpperCase();
  const normalizedCompactCode = normalizeSetIdentifier(setCode);

  return groups.find(
    (g) =>
      (g.abbreviation || '').toUpperCase() === normalizedCode ||
      String(g.groupId) === normalizedCode ||
      normalizeSetIdentifier(g.abbreviation || '') === normalizedCompactCode ||
      normalizeSetIdentifier(g.name || '') === normalizedCompactCode,
  );
}

function getGroupCardCount(group: TcgCsvGroup): number | undefined {
  const candidates: Array<number | undefined> = [
    group.totalCards,
    group.cardCount,
    group.totalItems,
    group.productCount,
    group.numOfCards,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }

  return undefined;
}

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

async function getGroups(tcg: TCGCsvTcg): Promise<TcgCsvGroup[]> {
  const resolvedTcg = normalizeTcg(tcg);
  if (!resolvedTcg) {
    throw new Error(`Unsupported TCG for tcgcsv: ${tcg}`);
  }
  const categoryId = TCGCSV_CATEGORY_IDS[resolvedTcg];
  const base = getTcgCsvBase();
  const url = `${base}/${categoryId}/groups`;
  const { data } = await axios.get<TcgCsvListResponse<TcgCsvGroup>>(url, { timeout: 20000 });
  return Array.isArray(data?.results) ? data.results : [];
}

async function getGroupProducts(tcg: TCGCsvTcg, groupId: number): Promise<TcgCsvProduct[]> {
  const resolvedTcg = normalizeTcg(tcg);
  if (!resolvedTcg) {
    throw new Error(`Unsupported TCG for tcgcsv: ${tcg}`);
  }
  const categoryId = TCGCSV_CATEGORY_IDS[resolvedTcg];
  const base = getTcgCsvBase();
  const url = `${base}/${categoryId}/${groupId}/products`;
  const { data } = await axios.get<TcgCsvListResponse<TcgCsvProduct>>(url, { timeout: 20000 });
  return Array.isArray(data?.results) ? data.results : [];
}

async function getGroupPrices(tcg: TCGCsvTcg, groupId: number): Promise<TcgCsvPrice[]> {
  const resolvedTcg = normalizeTcg(tcg);
  if (!resolvedTcg) {
    throw new Error(`Unsupported TCG for tcgcsv: ${tcg}`);
  }
  const categoryId = TCGCSV_CATEGORY_IDS[resolvedTcg];
  const base = getTcgCsvBase();
  const url = `${base}/${categoryId}/${groupId}/prices`;
  const { data } = await axios.get<TcgCsvListResponse<TcgCsvPrice>>(url, { timeout: 20000 });
  return Array.isArray(data?.results) ? data.results : [];
}

export async function listSets(tcg: TCGCsvTcg): Promise<ExternalEdition[]> {
  const groups = await getGroups(tcg);
  return groups.map((g) => ({
    code: (g.abbreviation || String(g.groupId)).toUpperCase(),
    name: g.name,
    releaseDate: g.publishedOn,
    totalCards: getGroupCardCount(g),
    source: 'tcgcsv',
  }));
}

export async function getSetCards(tcg: TCGCsvTcg, setCode: string): Promise<ExternalCard[]> {
  const groups = await getGroups(tcg);
  const group = resolveGroupBySetCode(groups, setCode);
  if (!group) return [];

  const [products, prices] = await Promise.all([
    getGroupProducts(tcg, group.groupId),
    getGroupPrices(tcg, group.groupId),
  ]);

  const priceByProductId = new Map<number, TcgCsvPrice>();
  for (const price of prices) {
    const existing = priceByProductId.get(price.productId);
    if (!existing) {
      priceByProductId.set(price.productId, price);
      continue;
    }
    const currentBest = pickBestPrice([existing, price]);
    if (currentBest) priceByProductId.set(price.productId, currentBest);
  }

  const cards = products
    .filter(isCardLikeProduct)
    .map((p) => tcgCsvToExternal(p as TcgCsvProduct, group, tcg, priceByProductId.get((p as TcgCsvProduct).productId)));

  return cards;
}

export async function getCardById(tcg: TCGCsvTcg, cardId: string): Promise<ExternalCard | null> {
  const groups = await getGroups(tcg);
  for (const group of groups) {
    const products = await getGroupProducts(tcg, group.groupId);
    const match = products.find((p) => String((p as TcgCsvProduct).productId) === String(cardId));
    if (match) {
      const prices = await getGroupPrices(tcg, group.groupId);
      const priceById = prices.filter((pr) => pr.productId === (match as TcgCsvProduct).productId);
      const best = pickBestPrice(priceById);
      return tcgCsvToExternal(match as TcgCsvProduct, group, tcg, best);
    }
  }
  return null;
}

export async function searchCards(tcg: TCGCsvTcg, query: string, limit = 50): Promise<ExternalCard[]> {
  const groups = await getGroups(tcg);
  const lower = query.toLowerCase();
  const results: ExternalCard[] = [];

  for (const group of groups) {
    const products = await getGroupProducts(tcg, group.groupId);
    const prices = await getGroupPrices(tcg, group.groupId);
    const priceByProductId = new Map<number, TcgCsvPrice>();
    for (const price of prices) {
      const existing = priceByProductId.get(price.productId);
      if (!existing) {
        priceByProductId.set(price.productId, price);
        continue;
      }
      const currentBest = pickBestPrice([existing, price]);
      if (currentBest) priceByProductId.set(price.productId, currentBest);
    }

    for (const p of products) {
      if (!isCardLikeProduct(p as TcgCsvProduct)) continue;
      if ((p.name || '').toLowerCase().includes(lower)) {
        const mapped = tcgCsvToExternal(p as TcgCsvProduct, group, tcg, priceByProductId.get((p as TcgCsvProduct).productId));
        results.push(mapped);
        if (results.length >= limit) return results;
      }
    }
  }

  return results;
}

export default {
  listSets,
  getSetCards,
  getCardById,
  searchCards,
};
