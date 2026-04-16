import apiClient from './api';
import type { EditionWithCounts, EditionInventory, Listing } from '../types';
import * as tcgcsvClient from './tcgcsv';
import * as scryfallClient from './scryfall';
import * as pokemonClient from './pokemontcg';
import * as ygoproClient from './ygopro';
import * as optcgClient from './optcg';
import * as localImports from './localImports';

const DEFAULT_USD_TO_CLP = Number(import.meta.env.VITE_MANUAL_USD_TO_CLP || import.meta.env.VITE_USD_TO_CLP) || 950;

function getUsdToClpRate(): number {
  // Priority: runtime stored manual rate -> env var -> default
  try {
    const stored = localStorage.getItem('netdecker.manual_usd_to_clp');
    if (stored) {
      const v = Number(stored);
      if (Number.isFinite(v) && v > 0) return v;
    }
  } catch (_) {}
  return DEFAULT_USD_TO_CLP;
}

function mapLocalToListing(l: ReturnType<typeof localImports.listLocalListings>[0]): Listing {
  const usdToClp = getUsdToClpRate();
  const reference = l.referencePrice ?? 0;
  const margin = l.marginMultiplier ?? 1;
  const final = Math.round((reference * margin * usdToClp) || 0);

  const card = {
    id: l.card.externalId,
    tcgId: l.tcg,
    editionId: l.card.editionCode ?? '',
    cardCode: l.card.cardNumber ?? l.card.externalId,
    cardName: l.card.cardName,
    cardNumber: l.card.cardNumber,
    rarity: l.card.rarity,
    colorIdentity: l.card.colorIdentity,
    tags: l.card.tags,
    imageUrl: l.card.imageUrl,
    description: l.card.description,
  } as any;

  return {
    id: l.id,
    cardId: l.card.externalId,
    card,
    editionId: l.card.editionCode ?? '',
    condition: (l.condition ?? 'NM') as any,
    quantity: l.quantity,
    referencePrice: reference,
    marginMultiplier: margin,
    exchangeRate: usdToClp,
    finalPrice: final,
    currency: 'CLP',
    status: 'manual',
    lastSyncedAt: undefined,
  } as Listing;
}

export async function getTCGs() {
  try {
    const { data } = await apiClient.get('/tcgs');
    return data;
  } catch (err) {
    // Offline fallback: return a minimal known TCG list
    return [
      { id: 'MAGIC', name: 'MAGIC', displayName: 'Magic: The Gathering' },
      { id: 'POKEMON', name: 'POKEMON', displayName: 'Pokémon' },
      { id: 'YUGIOH', name: 'YUGIOH', displayName: 'Yu-Gi-Oh!' },
      { id: 'ONE_PIECE', name: 'ONE_PIECE', displayName: 'One Piece' },
      { id: 'DIGIMON', name: 'DIGIMON', displayName: 'Digimon' },
      { id: 'WEISS_SCHWARZ', name: 'WEISS_SCHWARZ', displayName: 'Weiss Schwarz' },
    ] as any;
  }
}

export async function getTCGById(id: string) {
  try {
    const { data } = await apiClient.get(`/tcgs/${id}`);
    return data;
  } catch (_) {
    // minimal fallback
    return { id, name: id, displayName: id } as any;
  }
}

export async function searchCards(name: string, tcgId?: string, limit?: number) {
  const { data } = await apiClient.get('/cards/search', {
    params: { name, tcgId, limit }
  });
  return data;
}

/** Search cards by card code (partial match). Returns all rarities/editions that match. */
export async function searchCardsByCode(code: string, tcgId?: string, limit?: number) {
  const { data } = await apiClient.get('/cards/search', {
    params: { code, tcgId, limit }
  });
  return data;
}

export async function getCardById(id: string) {
  const { data } = await apiClient.get(`/cards/${id}`);
  return data;
}

export async function getAvailableListings(tcgId?: string, editionId?: string) {
  try {
    const { data } = await apiClient.get('/listings/available', {
      params: { tcgId, editionId }
    });
    return data;
  } catch (err) {
    // Fallback to local imports saved in browser
    const all = localImports.listLocalListings();
    let mapped = all.map(mapLocalToListing);
    if (tcgId) mapped = mapped.filter((l) => (l.card as any).tcgId === tcgId);
    if (editionId) mapped = mapped.filter((l) => l.editionId === editionId);
    return mapped;
  }
}

export async function getListingsByCard(cardId: string) {
  const { data } = await apiClient.get(`/listings/card/${cardId}`);
  return data;
}

export async function getListingById(id: string) {
  const { data } = await apiClient.get(`/listings/${id}`);
  return data;
}

export async function updateListingStock(
  listingId: string,
  op: 'set' | 'inc' | 'dec',
  value: number,
) {
  const { data } = await apiClient.patch(`/listings/${listingId}/stock`, { op, value });
  return data as { success: boolean; listingId: string; quantity: number };
}

export async function updateListingPricingMode(
  listingId: string,
  mode: 'manual' | 'api',
  manualPrice?: number,
) {
  const { data } = await apiClient.patch(`/listings/${listingId}/pricing-mode`, {
    mode,
    ...(mode === 'manual' && typeof manualPrice === 'number' ? { manualPrice } : {}),
  });
  return data as { success: boolean; pricingMode: 'manual' | 'api'; listing: Listing };
}

export async function previewListingPrice(referencePrice: number, marginMultiplier: number, roundingMultiple?: number) {
  const { data } = await apiClient.post('/listings/price-preview', {
    referencePrice,
    marginMultiplier,
    roundingMultiple
  });
  return data;
}

export async function previewAdminPricing(params: {
  listingId?: string;
  referencePrice?: number;
  marginMultiplier?: number;
  roundingMultiple?: number;
}) {
  const { data } = await apiClient.post('/admin/pricing/preview', params);
  return data;
}

export async function getListingPriceDebug(id: string) {
  const { data } = await apiClient.get(`/listings/${id}/price-debug`);
  return data;
}

export async function getInventoryValue() {
  try {
    const { data } = await apiClient.get('/listings/inventory-value');
    return data;
  } catch (err) {
    // compute from local listings
    const all = localImports.listLocalListings();
    const usdToClp = getUsdToClpRate();
    let totalCost = 0;
    let totalValue = 0;
    let itemCount = 0;
    for (const l of all) {
      const ref = l.referencePrice ?? 0;
      const qty = l.quantity ?? 0;
      const margin = l.marginMultiplier ?? 1;
      totalCost += ref * usdToClp * qty;
      totalValue += ref * margin * usdToClp * qty;
      itemCount += qty;
    }
    return { totalCost, totalValue, totalProfit: totalValue - totalCost, itemCount };
  }
}

export async function syncListingPrices(
  updates?: Array<{ listingId: string; referencePrice: number; marginMultiplier?: number }>,
  roundingMultiple?: number,
  notes?: string,
  fetchExternalPrices?: boolean,
  filters?: { tcgName?: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ'; editionId?: string },
) {
  const { data } = await apiClient.post('/listings/sync-prices', {
    updates,
    roundingMultiple,
    notes,
    fetchExternalPrices,
    ...(filters?.tcgName ? { tcgName: filters.tcgName } : {}),
    ...(filters?.editionId ? { editionId: filters.editionId } : {}),
  });
  return data;
}

export async function getPriceSyncRuns(limit: number = 20) {
  const { data } = await apiClient.get('/listings/sync-prices/runs', {
    params: { limit }
  });
  return data;
}

export async function getPriceSyncRunById(runId: string) {
  const { data } = await apiClient.get(`/listings/sync-prices/runs/${runId}`);
  return data;
}

export async function getCart(sessionId: string) {
  const { data } = await apiClient.get(`/cart/${sessionId}`);
  return data;
}

export async function addToCart(sessionId: string, listingId: string, quantity: number) {
  const { data } = await apiClient.post(`/cart/${sessionId}/add`, { listingId, quantity });
  return data;
}

export async function updateCartItemQuantity(sessionId: string, itemId: string, quantity: number) {
  const { data } = await apiClient.patch(`/cart/${sessionId}/item/${itemId}`, { quantity });
  return data;
}

export async function removeCartItem(sessionId: string, itemId: string) {
  const { data } = await apiClient.delete(`/cart/${sessionId}/item/${itemId}`);
  return data;
}

export async function checkoutCart(
  sessionId: string,
  customerEmail: string,
  shippingAddress?: string,
  notes?: string
) {
  const { data } = await apiClient.post(`/cart/${sessionId}/checkout`, {
    customerEmail,
    shippingAddress,
    notes
  });
  return data;
}

export async function validateInventoryCsv(file: File, importedBy: string = 'admin') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('importedBy', importedBy);

  const { data } = await apiClient.post('/inventory/import-csv/validate', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

  return data;
}

export async function importInventoryCsv(file: File, importedBy: string = 'admin') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('importedBy', importedBy);

  const { data } = await apiClient.post('/inventory/import-csv', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

  return data;
}

export async function exportInventoryCsv(params?: {
  scope?: 'edition' | 'tcg' | 'all';
  editionId?: string;
  tcgId?: string;
}) {
  const response = await apiClient.get('/inventory/export-csv', {
    params,
    responseType: 'blob',
  });
  return response.data as Blob;
}

export async function exportInventoryXlsxDavid(params?: {
  scope?: 'edition' | 'tcg' | 'all';
  editionId?: string;
  tcgId?: string;
}) {
  const response = await apiClient.get('/inventory/export-david-xlsx', {
    params,
    responseType: 'blob',
  });
  return response.data as Blob;
}

export async function getInventoryImports(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'createdAt' | 'status' | 'fileName' | 'totalRecords';
  sortDir?: 'asc' | 'desc';
}) {
  const { data } = await apiClient.get('/inventory/imports', { params });
  return data;
}

export async function getInventoryImportById(importId: string) {
  const { data } = await apiClient.get(`/inventory/imports/${importId}`);
  return data;
}

export async function rollbackInventoryImport(importId: string, params?: {
  force?: boolean;
  dryRun?: boolean;
  batchId?: string;
  batchIndex?: number;
  onlyListingIds?: string[];
  skipListingIds?: string[];
}) {
  const { data } = await apiClient.post(`/inventory/imports/${importId}/rollback`, params || {});
  return data;
}

export async function exportInventoryImportsCsv(params?: {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'createdAt' | 'status' | 'fileName' | 'totalRecords';
  sortDir?: 'asc' | 'desc';
}) {
  const response = await apiClient.get('/inventory/imports/export', {
    params,
    responseType: 'blob'
  });

  return response.data as Blob;
}

// ─────────────────────────────────────────────
// External card database API
// ─────────────────────────────────────────────


export async function searchExternalCards(
  tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ',
  query: string,
  options: { setCode?: string; page?: number; limit?: number } = {},
) {
  const limit = (options as any).limit ?? 50;

  // Primary: TCGCSV
  try {
    const tcgcsvRes = await tcgcsvClient.searchCards(tcg as any, query, limit);
    if (Array.isArray(tcgcsvRes) && tcgcsvRes.length > 0) return { success: true, tcg, query, total: tcgcsvRes.length, cards: tcgcsvRes };
  } catch (_) {
    // ignore and try fallbacks
  }

  // Fallbacks by TCG
  try {
    switch (tcg) {
      case 'MAGIC': {
        const res = await scryfallClient.searchCards(query, 1, limit);
        return { success: true, tcg, query, total: res.length, cards: res };
      }
      case 'POKEMON': {
        const res = await pokemonClient.searchCards(query, (options as any).setCode, limit);
        return { success: true, tcg, query, total: res.length, cards: res };
      }
      case 'YUGIOH': {
        const res = await ygoproClient.searchCards(query, (options as any).setCode);
        return { success: true, tcg, query, total: res.length, cards: res };
      }
      case 'ONE_PIECE': {
        const res = await optcgClient.searchCards(query);
        return { success: true, tcg, query, total: res.length, cards: res };
      }
      default:
        return { success: true, tcg, query, total: 0, cards: [] };
    }
  } catch (_) {
    return { success: true, tcg, query, total: 0, cards: [] };
  }
}


export async function listExternalSets(tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ') {
  // Primary: TCGCSV
  try {
    const tcgcsv = await tcgcsvClient.listSets(tcg as any);
    if (Array.isArray(tcgcsv) && tcgcsv.length > 0) return { success: true, tcg, total: tcgcsv.length, sets: tcgcsv };
  } catch (_) {}

  try {
    switch (tcg) {
      case 'MAGIC': {
        const res = await scryfallClient.listSets();
        return { success: true, tcg, total: res.length, sets: res };
      }
      case 'POKEMON': {
        const res = await pokemonClient.listSets();
        return { success: true, tcg, total: res.length, sets: res };
      }
      case 'YUGIOH': {
        const res = await ygoproClient.listSets();
        return { success: true, tcg, total: res.length, sets: res };
      }
      case 'ONE_PIECE': {
        const res = await optcgClient.listSets();
        return { success: true, tcg, total: res.length, sets: res };
      }
      default:
        return { success: true, tcg, total: 0, sets: [] };
    }
  } catch (_) {
    return { success: true, tcg, total: 0, sets: [] };
  }
}


export async function getExternalCardById(
  tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ',
  cardId: string,
) {
  // Primary: TCGCSV
  try {
    const tcgcsv = await tcgcsvClient.getCardById(tcg as any, cardId);
    if (tcgcsv) return { success: true, card: tcgcsv };
  } catch (_) {}

  try {
    switch (tcg) {
      case 'MAGIC':
        return { success: true, card: await scryfallClient.getCardById(cardId) };
      case 'POKEMON':
        return { success: true, card: await pokemonClient.getCardById(cardId) };
      case 'YUGIOH':
        return { success: true, card: await ygoproClient.getCardById(cardId) };
      case 'ONE_PIECE':
        return { success: true, card: await optcgClient.getCardById(cardId) };
      default:
        return { success: true, card: null };
    }
  } catch (_) {
    return { success: true, card: null };
  }
}


export async function importExternalCard(params: {
  tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';
  cardId: string;
  createListing?: boolean;
  referencePrice?: number;
  marginMultiplier?: number;
  quantity?: number;
  condition?: string;
}) {
  try {
    const { data } = await apiClient.post('/external/import/card', params);
    return data;
  } catch (err) {
    // Fallback: perform a local import (stored in localStorage)
    const res = await localImports.importCardLocal(params.tcg, params.cardId, {
      createListing: params.createListing,
      referencePrice: params.referencePrice,
      marginMultiplier: params.marginMultiplier,
      quantity: params.quantity,
      condition: params.condition,
    });
    return { success: true, result: res.result };
  }
}


export async function importExternalSearch(params: {
  tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';
  query: string;
  setCode?: string;
  page?: number;
  createListing?: boolean;
  referencePrice?: number;
  marginMultiplier?: number;
}) {
  try {
    const { data } = await apiClient.post('/external/import/search', params);
    return data;
  } catch (err) {
    const res = await localImports.importSearchLocal(params.tcg, params.query, {
      setCode: params.setCode,
      page: params.page,
      createListing: params.createListing,
      referencePrice: params.referencePrice,
      marginMultiplier: params.marginMultiplier,
      quantity: (params as any).quantity,
    });
    return { success: true, total: res.total, created: res.created, updated: res.updated, skipped: res.skipped, errors: res.errors, results: res.results };
  }
}


export async function importExternalSet(params: {
  tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';
  setCode: string;
  createListing?: boolean;
  marginMultiplier?: number;
}) {
  try {
    const { data } = await apiClient.post('/external/import/set', params);
    return data;
  } catch (err) {
    const res = await localImports.importSetLocal(params.tcg, params.setCode, {
      createListing: params.createListing,
      marginMultiplier: params.marginMultiplier,
    });
    return { success: true, total: res.total, created: res.created, updated: res.updated, skipped: res.skipped, errors: res.errors, results: res.results };
  }
}

// ─────────────────────────────────────────────
// Admin dashboard API
// ─────────────────────────────────────────────

export async function getAdminDashboard() {
  try {
    const { data } = await apiClient.get('/admin/dashboard');
    return data;
  } catch (err) {
    // build a minimal dashboard from local listings
    const all = localImports.listLocalListings();
    const uniqueCards = new Set(all.map((l) => l.card.externalId));
    const totalListings = all.length;
    const activeListings = all.filter((l) => l.quantity > 0).length;
    const lowStock = all.filter((l) => l.quantity <= 2).length;
    const usdToClp = getUsdToClpRate();
    const inventoryValue = all.reduce((acc, l) => acc + ((l.referencePrice ?? 0) * (l.marginMultiplier ?? 1) * (l.quantity ?? 0) * usdToClp), 0);

    return {
      kpis: {
        catalog: { totalCards: uniqueCards.size, totalListings, activeListings, lowStockListings: lowStock, outOfStockListings: all.filter((l) => l.quantity === 0).length },
        inventory: { totalValueCLP: Math.round(inventoryValue), currency: 'CLP' },
        orders: { total: 0, pending: 0 },
        exchangeRate: { usdToCLP: usdToClp, source: 'local', fetchedAt: new Date().toISOString() },
      },
      recentImports: [],
      recentSyncRuns: [],
    } as any;
  }
}

export async function getStockAlerts(threshold?: number) {
  try {
    const { data } = await apiClient.get('/admin/stock-alerts', {
      params: threshold ? { threshold } : undefined,
    });
    return data;
  } catch (_) {
    const th = typeof threshold === 'number' ? threshold : 2;
    const all = localImports.listLocalListings();
    const low = all.filter((l) => l.quantity <= th).map((l) => ({ listingId: l.id, quantity: l.quantity, cardName: l.card.cardName }));
    return { alerts: low } as any;
  }
}

export async function getPriceVolatility(limit?: number, window?: '24h' | '7d' | '30d' | '90d') {
  try {
    const { data } = await apiClient.get('/admin/price-volatility', {
      params: {
        ...(limit ? { limit } : {}),
        ...(window ? { window } : {}),
      },
    });
    return data;
  } catch (_) {
    return { success: true, total: 0, events: [] } as any;
  }
}

export async function getAdminEditions() {
  try {
    const { data } = await apiClient.get('/admin/editions');
    return data;
  } catch (_) {
    return [] as any;
  }
}

export async function getTcgplayerCoverage() {
  try {
    const { data } = await apiClient.get('/admin/tcgplayer-coverage');
    return data;
  } catch (_) {
    return { global: { totalCards: 0, coveredCards: 0, uncoveredCards: 0, coveragePercent: 0 }, byTcg: [] } as any;
  }
}

export async function getAdminPricingConfig() {
  try {
    const { data } = await apiClient.get('/admin/pricing-config');
    return data;
  } catch (_) {
    // default config when backend not available
    return { config: { defaultMarginMultiplier: 1.2, exchangeRate: { mode: 'manual', activeRate: getUsdToClpRate(), source: 'local' } } } as any;
  }
}

export async function updateAdminPricingConfig(params: {
  defaultMarginMultiplier?: number;
  applyMarginToExisting?: boolean;
  exchangeRateMode?: 'api' | 'manual';
  manualUsdToClp?: number;
  importSetSyncPricesDefault?: boolean;
}) {
  const { data } = await apiClient.post('/admin/pricing-config', params);
  return data;
}

export async function bootstrapCatalog(params?: {
  tcg?: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';
  setCode?: string;
  setLimit?: number;
  dryRun?: boolean;
  createListings?: boolean;
  initialQuantity?: number;
  marginMultiplier?: number;
}) {
  const { data } = await apiClient.post('/admin/catalog/bootstrap', params || {});
  return data;
}

export async function syncCatalog(params?: {
  tcg?: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';
  dryRun?: boolean;
  createListings?: boolean;
  initialQuantity?: number;
  marginMultiplier?: number;
  concurrency?: number;
}) {
  const { data } = await apiClient.post('/admin/catalog/sync', params || {});
  return data;
}

/** Fetches all editions with card/listing counts. Pass `tcgId` to filter by game; `activeOnly` defaults to true on the backend. */
export async function getEditions(params?: { tcgId?: string; activeOnly?: boolean }): Promise<EditionWithCounts[]> {
  try {
    const response = await apiClient.get('/editions', { params });
    return response.data;
  } catch (_) {
    // Fallback: use external set list for the given TCG if available
    if (params?.tcgId) {
      try {
        const res: any = await listExternalSets(params.tcgId as any);
        const sets = (res && res.sets) || [];
        return sets.map((s: any) => ({
          id: `${params.tcgId}:${s.code}`,
          tcg: { id: params.tcgId, name: params.tcgId, displayName: params.tcgId },
          editionCode: s.code,
          editionName: s.name,
          releaseDate: s.releaseDate,
          isActive: true,
          cardCount: s.totalCards ?? 0,
          listingCount: 0,
        } as EditionWithCounts));
      } catch (_) {
        return [] as EditionWithCounts[];
      }
    }
    return [] as EditionWithCounts[];
  }
}

/** Retrieves a single edition with its metadata and card/listing counts. */
export async function getEditionById(id: string): Promise<EditionWithCounts> {
  const response = await apiClient.get(`/editions/${id}`);
  return response.data;
}

/** Retrieves all cards in an edition along with their listings — used for inventory management. */
export async function getEditionCardsWithStock(editionId: string): Promise<EditionInventory> {
  try {
    const response = await apiClient.get(`/editions/${editionId}/cards-with-stock`);
    return response.data;
  } catch (_) {
    // Build inventory view from local listings
    const all = localImports.listLocalListings();
    const matched = all.filter((l) => l.card.editionCode === editionId || l.card.editionCode === editionId.split(':').pop());
    const byCard: Record<string, any[]> = {};
    for (const l of matched) {
      const key = l.card.externalId;
      byCard[key] = byCard[key] || [];
      byCard[key].push(l);
    }

    const cards = Object.keys(byCard).map((cardId) => {
      const group = byCard[cardId];
      const first = group[0];
      const listings = group.map((li) => ({
        id: li.id,
        condition: li.condition ?? 'NM',
        quantity: li.quantity,
        referencePrice: li.referencePrice ?? 0,
        marginMultiplier: li.marginMultiplier ?? 1,
        finalPrice: Math.round((li.referencePrice ?? 0) * (li.marginMultiplier ?? 1) * getUsdToClpRate()),
        currency: 'CLP',
        lastSyncedAt: undefined,
        status: 'manual',
      }));

      return {
        id: first.card.externalId,
        cardCode: first.card.cardNumber ?? first.card.externalId,
        cardName: first.card.cardName,
        cardNumber: first.card.cardNumber,
        rarity: first.card.rarity,
        colorIdentity: first.card.colorIdentity,
        imageUrl: first.card.imageUrl,
        tags: first.card.tags,
        listings,
      } as any;
    });

    const edition: any = { id: editionId, editionCode: editionId, editionName: editionId, tcg: { id: 'LOCAL', name: 'LOCAL', displayName: 'Local' } };

    return { edition, totalCards: cards.length, cardsWithStock: cards.filter((c) => (c.listings?.[0]?.quantity ?? 0) > 0).length, cards } as EditionInventory;
  }
}

/** Downloads a pre-filled CSV template for the specified edition, ready for stock entry. */
export async function downloadEditionCsvTemplate(editionId: string): Promise<Blob> {
  const response = await apiClient.get(`/editions/${editionId}/csv-template`, {
    responseType: 'blob',
  });
  return response.data;
}

/** Performs bulk stock quantity updates for multiple listings in a single request. */
export async function batchUpdateStock(updates: Array<{ listingId: string; quantity: number }>): Promise<{ updated: number }> {
  const response = await apiClient.post('/listings/batch-stock', { updates });
  return response.data;
}

/**
 * Returns listings whose stock is at or below the given threshold (default: 2).
 * Useful for low-stock alerts on the dashboard.
 */
export async function getLowStockListings(threshold?: number): Promise<Listing[]> {
  const response = await apiClient.get('/listings/low-stock', { params: { threshold } });
  return response.data;
}

/**
 * Retrieves historical price records. Pass `listingId` to filter to a specific listing;
 * omit it to retrieve global price history across all listings.
 */
export async function getPriceHistory(listingId?: string, limit?: number): Promise<Array<{ listingId: string; price: number; currency: string; source: string; recordedAt: string }>> {
  const response = await apiClient.get('/price-history', { params: { listingId, limit } });
  return response.data;
}

/**
 * Resets all catalog data (cards, editions, listings, price history, imports).
 * Preserves TCG records and exchange rates.
 */
export async function resetCatalog(): Promise<{ success: boolean; message: string }> {
  const { data } = await apiClient.post('/admin/catalog/reset', { confirm: true });
  return data;
}
