import apiClient from './api';
import { buildApiUrl } from './api';
import type { Card, EditionWithCounts, EditionInventory, Listing } from '../types';
import * as tcgcsvClient from './tcgcsv';
const ALLOW_DIRECT_TCGCSV = String(import.meta.env.VITE_ALLOW_TCGCSV_DIRECT || '').toLowerCase() === 'true';
import * as localImports from './localImports';

const DEFAULT_USD_TO_CLP = Number(import.meta.env.VITE_MANUAL_USD_TO_CLP || import.meta.env.VITE_USD_TO_CLP) || 1000;
type SupportedTcgId = 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';

const DEFAULT_TCG_OPTIONS: Array<{ id: SupportedTcgId; name: SupportedTcgId; displayName: string }> = [
  { id: 'MAGIC', name: 'MAGIC', displayName: 'Magic: The Gathering' },
  { id: 'POKEMON', name: 'POKEMON', displayName: 'Pokémon' },
  { id: 'YUGIOH', name: 'YUGIOH', displayName: 'Yu-Gi-Oh!' },
  { id: 'ONE_PIECE', name: 'ONE_PIECE', displayName: 'One Piece' },
  { id: 'DIGIMON', name: 'DIGIMON', displayName: 'Digimon' },
  { id: 'WEISS_SCHWARZ', name: 'WEISS_SCHWARZ', displayName: 'Weiss Schwarz' },
];

function normalizeTcgEntry(entry: unknown): { id: SupportedTcgId; name: SupportedTcgId; displayName: string } | null {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry as { id?: string | null; name?: string | null; displayName?: string | null };
  const normalizedId = normalizeTcgId(candidate.id || candidate.name || undefined);
  if (!normalizedId) return null;

  return {
    id: normalizedId,
    name: normalizedId,
    displayName: String(candidate.displayName || candidate.name || normalizedId),
  };
}

function mergeWithDefaultTcgs(entries: unknown[]): Array<{ id: SupportedTcgId; name: SupportedTcgId; displayName: string }> {
  const byId = new Map<SupportedTcgId, { id: SupportedTcgId; name: SupportedTcgId; displayName: string }>();

  for (const entry of entries) {
    const normalized = normalizeTcgEntry(entry);
    if (normalized) {
      byId.set(normalized.id, normalized);
    }
  }

  for (const fallback of DEFAULT_TCG_OPTIONS) {
    if (!byId.has(fallback.id)) {
      byId.set(fallback.id, fallback);
    }
  }

  return DEFAULT_TCG_OPTIONS.map((tcg) => byId.get(tcg.id) as { id: SupportedTcgId; name: SupportedTcgId; displayName: string });
}

function normalizeTcgId(value?: string | null): 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ' | undefined {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

  const aliases: Record<string, 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ'> = {
    MAGIC: 'MAGIC',
    MTG: 'MAGIC',
    POKEMON: 'POKEMON',
    POKEMON_TCG: 'POKEMON',
    YUGIOH: 'YUGIOH',
    YU_GI_OH: 'YUGIOH',
    YU_GI_OH_TCG: 'YUGIOH',
    ONEPIECE: 'ONE_PIECE',
    ONE_PIECE: 'ONE_PIECE',
    DIGIMON: 'DIGIMON',
    WEISS_SCHWARZ: 'WEISS_SCHWARZ',
    WEISS: 'WEISS_SCHWARZ',
  };

  return aliases[normalized];
}

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

type CatalogListingCard = Partial<Card> & {
  tcgId?: string | null;
  editionId?: string | null;
  tcg?: { id: string | null; name: string | null; displayName: string | null } | null;
  edition?: { id: string; editionCode: string; editionName: string | null; tcgId: string | null } | null;
};

type CatalogListingPayload = {
  card?: CatalogListingCard;
  [key: string]: unknown;
};

function normalizeCatalogCard(card?: CatalogListingCard): CatalogListingCard {
  const normalized: CatalogListingCard = { ...(card ?? {}) };

  if (!normalized.tcg || !normalized.tcg.name) {
    normalized.tcg = {
      id: normalized.tcgId ?? null,
      name: normalized.tcgId ?? null,
      displayName: normalized.tcgId ?? null,
    };
  }

  if (!normalized.edition && normalized.editionId) {
    const parts = String(normalized.editionId).split(':');
    normalized.edition = {
      id: normalized.editionId,
      editionCode: parts[1] || parts[0],
      editionName: null,
      tcgId: parts[0] || null,
    };
  }

  return normalized;
}

function normalizeCatalogListings(data: unknown): Listing[] {
  if (!data) return [];

  if (Array.isArray(data)) {
    return data.map((listing) => ({
      ...(listing as CatalogListingPayload),
      card: normalizeCatalogCard((listing as CatalogListingPayload).card),
    })) as Listing[];
  }

  if (typeof data === 'object' && data !== null && Array.isArray((data as { listings?: unknown[] }).listings)) {
    return (data as { listings: unknown[] }).listings.map((listing) => ({
      ...(listing as CatalogListingPayload),
      card: normalizeCatalogCard((listing as CatalogListingPayload).card),
    })) as Listing[];
  }

  return [];
}

function isAuthOrScopeError(err: unknown): boolean {
  const status = Number((err as { response?: { status?: number } })?.response?.status);
  return status === 401 || status === 403;
}

export async function getTCGs(options?: { allowFallback?: boolean }) {
  const allowFallback = options?.allowFallback ?? true;
  try {
    const { data } = await apiClient.get('/tcgs');
    // Backend may return an object like { success, total, tcgs: [...] }
    if (!data) return [...DEFAULT_TCG_OPTIONS] as any;
    if (Array.isArray(data)) return mergeWithDefaultTcgs(data) as any;
    if (Array.isArray((data as any).tcgs)) return mergeWithDefaultTcgs((data as any).tcgs) as any;
    return [...DEFAULT_TCG_OPTIONS] as any;
  } catch (err) {
    if (!allowFallback) {
      throw err;
    }
    // Offline fallback: return known supported TCG list
    return [...DEFAULT_TCG_OPTIONS] as any;
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
  try {
    const { data } = await apiClient.get('/cards/search', {
      params: { name, tcgId, limit }
    });
    return data;
  } catch (_) {
    // Fallback: search only through TCGCSV when direct access is enabled.
    const max = limit ?? 50;
    const results: any[] = [];

    const toCard = (ec: any) => ({
      id: ec.externalId,
      tcgId: ec.tcg,
      editionId: `${ec.tcg}:${ec.editionCode}`,
      cardCode: ec.cardNumber ?? ec.externalId,
      cardName: ec.cardName,
      cardNumber: ec.cardNumber,
      rarity: ec.rarity,
      colorIdentity: ec.colorIdentity,
      tags: ec.tags,
      imageUrl: ec.imageUrl,
      description: ec.description,
    });

    const tryTcg = async (tcg: any) => {
      try {
        let cards: any[] = [];
        try {
          if (ALLOW_DIRECT_TCGCSV) {
            cards = await tcgcsvClient.searchCards(tcg as any, name, max);
          } else {
            cards = [];
          }
        } catch (_) {
          cards = [];
        }
        for (const c of (cards || [])) {
          results.push(toCard(c));
          if (results.length >= max) return;
        }
      } catch (_) {}
    };

    if (tcgId) {
      await tryTcg(tcgId);
    } else {
      const allTcgs = ['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON', 'WEISS_SCHWARZ'];
      for (const t of allTcgs) {
        await tryTcg(t);
        if (results.length >= max) break;
      }
    }

    return results.slice(0, max);
  }
}

/** Search cards by card code (partial match). Returns all rarities/editions that match. */
export async function searchCardsByCode(code: string, tcgId?: string, limit?: number) {
  try {
    const { data } = await apiClient.get('/cards/search', {
      params: { code, tcgId, limit }
    });
    return data;
  } catch (_) {
    // Fallback: search by name/code across external sources
    const q = code;
    return await searchCards(q, tcgId, limit);
  }
}

export async function getCardById(id: string) {
  const { data } = await apiClient.get(`/cards/${id}`);
  return data;
}

export async function getAvailableListings(tcgId?: string, editionId?: string): Promise<Listing[]> {
  try {
    const { data } = await apiClient.get('/listings/available', {
      params: { tcgId, editionId }
    });
    return normalizeCatalogListings(data);
  } catch (err) {
    if (isAuthOrScopeError(err)) {
      throw new Error('No autorizado o sin scope de tienda válido para cargar listings disponibles.');
    }
    // Fallback to local imports saved in browser
    const all = localImports.listLocalListings();
    let mapped = all.map(mapLocalToListing);
    if (tcgId) mapped = mapped.filter((l) => (l.card as any).tcgId === tcgId);
    if (editionId) mapped = mapped.filter((l) => l.editionId === editionId);
    return mapped;
  }
}

export async function getListingsByCard(cardId: string): Promise<Listing[]> {
  try {
    const { data } = await apiClient.get(`/listings/card/${cardId}`);
    return normalizeCatalogListings(data);
  } catch (_) {
    const all = localImports.listLocalListings();
    const matched = all.filter((l) => String(l.card.externalId) === String(cardId));
    return matched.map(mapLocalToListing);
  }
}

export async function getListingById(id: string) {
  try {
    const { data } = await apiClient.get(`/listings/${id}`);
    return data;
  } catch (_) {
    const all = localImports.listLocalListings();
    const found = all.find((l) => l.id === id);
    if (!found) throw new Error('Listing not found');
    return mapLocalToListing(found);
  }
}

export async function updateListingStock(
  listingId: string,
  op: 'set' | 'inc' | 'dec',
  value: number,
  storeId?: string | null,
) {
  try {
    const payload: any = { op, value };
    if (storeId) payload.storeId = storeId;
    const { data } = await apiClient.patch(`/listings/${listingId}/stock`, payload);
    return data as { success: boolean; listingId: string; quantity: number };
  } catch (_) {
    // Local fallback
    const all = localImports.listLocalListings();
    const idx = all.findIndex((l) => l.id === listingId);
    if (idx === -1) throw new Error('Listing not found');
    const current = all[idx];
    let nextQty = current.quantity ?? 0;
    if (op === 'set') nextQty = value;
    if (op === 'inc') nextQty = nextQty + value;
    if (op === 'dec') nextQty = Math.max(0, nextQty - value);
    localImports.updateListing({ id: listingId, quantity: nextQty });
    return { success: true, listingId, quantity: nextQty } as any;
  }
}

export async function updateListingPricingMode(
  listingId: string,
  mode: 'manual' | 'api',
  manualPrice?: number,
) {
  try {
    const { data } = await apiClient.patch(`/listings/${listingId}/pricing-mode`, {
      mode,
      ...(mode === 'manual' && typeof manualPrice === 'number' ? { manualPrice } : {}),
    });
    return data as { success: boolean; pricingMode: 'manual' | 'api'; listing: Listing };
  } catch (_) {
    // Local fallback: update local listing referencePrice when switching to manual
    const all = localImports.listLocalListings();
    const found = all.find((l) => l.id === listingId);
    if (!found) throw new Error('Listing not found');
    if (mode === 'manual' && typeof manualPrice === 'number') {
      localImports.updateListing({ id: listingId, referencePrice: manualPrice });
    }
    const updated = localImports.listLocalListings().find((l) => l.id === listingId)!;
    return { success: true, pricingMode: mode, listing: mapLocalToListing(updated) } as any;
  }
}

export async function previewListingPrice(referencePrice: number, marginMultiplier: number, roundingMultiple?: number) {
  try {
    const { data } = await apiClient.post('/listings/price-preview', {
      referencePrice,
      marginMultiplier,
      roundingMultiple
    });
    return data;
  } catch (_) {
    const usd = getUsdToClpRate();
    const final = Math.round((referencePrice || 0) * (marginMultiplier || 1) * usd);
    return { finalPrice: final, currency: 'CLP' } as any;
  }
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
  try {
    const { data } = await apiClient.post('/listings/sync-prices', {
      updates,
      roundingMultiple,
      notes,
      fetchExternalPrices,
      ...(filters?.tcgName ? { tcgName: filters.tcgName } : {}),
      ...(filters?.editionId ? { editionId: filters.editionId } : {}),
    });
    return data;
  } catch (_) {
    // Local fallback: apply updates to local listings and compute summary
    const all = localImports.listLocalListings();
    let processed = 0;
    let updated = 0;
    if (Array.isArray(updates) && updates.length > 0) {
      for (const u of updates) {
        const idx = all.findIndex((l) => l.id === u.listingId);
        if (idx === -1) continue;
        processed += 1;
        try {
          localImports.updateListing({ id: u.listingId, referencePrice: u.referencePrice, marginMultiplier: u.marginMultiplier ?? all[idx].marginMultiplier });
          updated += 1;
        } catch (_) {}
      }
    } else {
      // No updates array => nothing to do in local fallback
    }
    return { success: true, processed, updated } as any;
  }
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
  try {
    const { data } = await apiClient.post(`/cart/${sessionId}/add`, { listingId, quantity });
    return data;
  } catch (err: any) {
    if (err?.response?.status === 409) {
      throw new Error('Tu carrito cambio, por favor revisa cantidades y vuelve a intentar.');
    }
    throw err;
  }
}

export async function updateCartItemQuantity(sessionId: string, itemId: string, quantity: number) {
  try {
    const { data } = await apiClient.patch(`/cart/${sessionId}/item/${itemId}`, { quantity });
    return data;
  } catch (err: any) {
    if (err?.response?.status === 409) {
      throw new Error('Tu carrito cambio, por favor revisa cantidades y vuelve a intentar.');
    }
    throw err;
  }
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
  // Run a quick pre-check to get recommended chunk size (UI may use it), then proceed with upload.
  try {
    const pre = new FormData();
    pre.append('file', file);
    pre.append('importedBy', importedBy);
    pre.append('precheck', 'true');
    const preResp = await fetch(buildApiUrl('/inventory/import-csv'), { method: 'POST', body: pre });
    if (preResp && preResp.ok) {
      try { const prejson = await preResp.json(); console.info('Import precheck', prejson); } catch (_) {}
    }
  } catch (_) {}

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

export async function getInventoryImports(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'createdAt' | 'status' | 'fileName' | 'totalRecords';
  sortDir?: 'asc' | 'desc';
}) {
  try {
    const { data } = await apiClient.get('/inventory/imports', { params });
    return data;
  } catch (_) {
    // Fallback: read import jobs from localStorage if present
    try {
      const raw = localStorage.getItem('netdecker.local_import_jobs_v1');
      const jobs = raw ? JSON.parse(raw) : [];
      return { items: jobs || [], total: (jobs || []).length } as any;
    } catch (_) {
      return { items: [], total: 0 } as any;
    }
  }
}

export async function getInventoryImportById(importId: string) {
  try {
    const { data } = await apiClient.get(`/inventory/imports/${importId}`);
    return data;
  } catch (_) {
    try {
      const raw = localStorage.getItem('netdecker.local_import_jobs_v1');
      const jobs = raw ? JSON.parse(raw) : [];
      const found = (jobs || []).find((j: any) => j.id === importId);
      if (!found) throw new Error('Import not found');
      return found;
    } catch (err) {
      throw err;
    }
  }
}

export async function rollbackInventoryImport(importId: string, params?: {
  force?: boolean;
  dryRun?: boolean;
  batchId?: string;
  batchIndex?: number;
  onlyListingIds?: string[];
  skipListingIds?: string[];
}) {
  try {
    const { data } = await apiClient.post(`/inventory/imports/${importId}/rollback`, params || {});
    return data;
  } catch (_) {
    return { success: false, message: 'Backend not available' } as any;
  }
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

  // Primary: backend API (/api/external/search) — fallback to direct TCGCSV only.
  try {
    const { data } = await apiClient.get('/external/search', {
      params: { tcg, query, setCode: (options as any).setCode, page: (options as any).page, limit },
    });
    if (data && Array.isArray(data.cards) && data.cards.length > 0) {
      return { success: true, tcg, query, total: data.total ?? data.cards.length, cards: data.cards };
    }
  } catch (_) {
    // ignore and try fallbacks
  }

  // Fallback: TCGCSV client in-browser (only if explicitly enabled)
  if (ALLOW_DIRECT_TCGCSV) {
    try {
      const tcgcsvRes = await tcgcsvClient.searchCards(tcg as any, query, limit);
      if (Array.isArray(tcgcsvRes) && tcgcsvRes.length > 0) return { success: true, tcg, query, total: tcgcsvRes.length, cards: tcgcsvRes };
    } catch (_) {}
  }

  return { success: true, tcg, query, total: 0, cards: [] };
}


export async function listExternalSets(tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ') {
  // Primary: query backend API which centralizes tcgcsv + caching
  try {
    const { data } = await apiClient.get('/external/sets', { params: { tcg } });
    if (data && Array.isArray(data.sets) && data.sets.length > 0) return { success: true, tcg, total: data.sets.length, sets: data.sets };
  } catch (_) {}

  // Fallback: direct TCGCSV client in-browser (only if explicitly enabled)
  if (ALLOW_DIRECT_TCGCSV) {
    try {
      const tcgcsv = await tcgcsvClient.listSets(tcg as any);
      if (Array.isArray(tcgcsv) && tcgcsv.length > 0) return { success: true, tcg, total: tcgcsv.length, sets: tcgcsv };
    } catch (_) {}
  }

  return { success: true, tcg, total: 0, sets: [] };
}


export async function getExternalCardById(
  tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ',
  cardId: string,
) {
  // Primary: TCGCSV (only if explicitly enabled)
  if (ALLOW_DIRECT_TCGCSV) {
    try {
      const tcgcsv = await tcgcsvClient.getCardById(tcg as any, cardId);
      if (tcgcsv) return { success: true, card: tcgcsv };
    } catch (_) {}
  }

  return { success: true, card: null };
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
  const createListing = params.createListing ?? true;

  try {
    const { data } = await apiClient.post('/external/import/set', {
      ...params,
      createListing,
    });
    return data;
  } catch (err) {
    const res = await localImports.importSetLocal(params.tcg, params.setCode, {
      createListing,
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

export type TenantVisibilityDiagnostics = {
  success: boolean;
  diagnostics: {
    resolvedStoreId: string | null;
    scopeMode: 'store-scoped' | 'global';
    threshold: number;
    counts: {
      inventoryListings: number;
      inventoryInStockListings: number;
      pricingListings: number;
      lowStockListings: number;
      storefrontListings: number;
      hiddenByStatusListings: number;
    };
    filters: {
      pricingStatuses: string[];
      storefrontStatuses: string[];
      hiddenStatusesExcludedFromPricing?: string[];
    };
  };
};

export async function getTenantVisibilityDiagnostics(threshold?: number): Promise<TenantVisibilityDiagnostics> {
  const { data } = await apiClient.get('/admin/tenant/visibility-diagnostics', {
    params: threshold ? { threshold } : undefined,
  });
  return data as TenantVisibilityDiagnostics;
}

export async function normalizeInStockStatuses(storeId?: string): Promise<{ success: boolean; scopeStoreId: string; updated: number }> {
  const { data } = await apiClient.post('/admin/tenant/normalize-in-stock-statuses', {
    ...(storeId ? { storeId } : {}),
  });
  return data;
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
export async function getEditions(params?: { tcgId?: string; activeOnly?: boolean; strict?: boolean }): Promise<EditionWithCounts[]> {
  const { strict, ...queryParams } = params || {};
  try {
    const response = await apiClient.get('/editions', { params: queryParams });
    return response.data;
  } catch (error) {
    if (strict) {
      throw error;
    }
    // Fallback: only surface external sets when the caller explicitly requests non-active sets
    // (e.g., Import page uses `activeOnly: false`). For normal inventory views we avoid
    // pre-populating external sets so the UI doesn't show sets before they're imported.
    if (params?.tcgId && params.activeOnly === false) {
      try {
        const res: any = await listExternalSets(params.tcgId as any);
        const sets = (res && res.sets) || [];
        return sets.map((s: any) => ({
          id: `${params.tcgId}:${s.code}`,
          tcg: { id: params.tcgId, name: params.tcgId, displayName: params.tcgId },
          editionCode: s.code,
          editionName: s.name,
          releaseDate: s.releaseDate,
          isActive: false,
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
export async function getEditionCardsWithStock(
  editionId: string,
  editionCode?: string,
  tcgId?: string,
  options?: { strict?: boolean },
): Promise<EditionInventory> {
  const editionCandidates = Array.from(new Set([
    editionId,
    editionCode && editionCode !== editionId ? editionCode : undefined,
    editionId.includes(':') ? editionId.split(':').slice(1).join(':') : undefined,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));

  try {
    for (const candidate of editionCandidates) {
      try {
        const response = await apiClient.get(`/editions/${candidate}/cards-with-stock`);
        return response.data;
      } catch (error) {
        const status = (error as any)?.response?.status;
        if (status !== 404 || candidate === editionCandidates[editionCandidates.length - 1]) {
          throw error;
        }
      }
    }
    throw new Error('Edition not found');
  } catch (error) {
    if (options?.strict) {
      throw error;
    }
    if (!ALLOW_DIRECT_TCGCSV) {
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

      const resolvedSetCode = editionCode || (editionId.includes(':') ? editionId.split(':').slice(1).join(':') : editionId);
      const resolvedTcg = normalizeTcgId(tcgId || (editionId.includes(':') ? editionId.split(':')[0] : undefined));
      const edition: any = { id: editionId, editionCode: resolvedSetCode, editionName: resolvedSetCode, tcg: { id: resolvedTcg || 'LOCAL', name: resolvedTcg || 'LOCAL', displayName: resolvedTcg || 'Local' } };

      return { edition, totalCards: cards.length, cardsWithStock: cards.filter((c) => (c.listings?.[0]?.quantity ?? 0) > 0).length, cards } as EditionInventory;
    }

    const resolvedSetCode = editionCode || (editionId.includes(':') ? editionId.split(':').slice(1).join(':') : editionId);
    const resolvedTcg = normalizeTcgId(tcgId || (editionId.includes(':') ? editionId.split(':')[0] : undefined));

    const externalCards: any[] = [];

    const tryFetch = async (tryTcg?: string) => {
      if (!resolvedSetCode) return [];
      const normalized = normalizeTcgId(tryTcg || resolvedTcg || 'MAGIC');
      if (!normalized) return [];
      try {
        const cards = await tcgcsvClient.getSetCards(normalized, resolvedSetCode);
        return Array.isArray(cards) ? cards : [];
      } catch (_) {
        return [];
      }
    };

    if (resolvedTcg) {
      externalCards.push(...(await tryFetch(resolvedTcg)));
    } else {
      const allTcgs = ['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON', 'WEISS_SCHWARZ'];
      for (const t of allTcgs) {
        const found = await tryFetch(t);
        if (found && found.length > 0) {
          externalCards.push(...found);
          break;
        }
      }
    }

    if (externalCards.length > 0) {
      const cards = externalCards.map((c) => ({
        id: c.externalId,
        cardCode: c.cardNumber ?? c.externalId,
        cardName: c.cardName,
        cardNumber: c.cardNumber,
        rarity: c.rarity,
        colorIdentity: c.colorIdentity,
        imageUrl: c.imageUrl,
        tags: c.tags,
        listings: [],
      } as any));

      const edition: any = { id: editionId, editionCode: resolvedSetCode, editionName: resolvedSetCode, tcg: { id: resolvedTcg || 'EXTERNAL', name: resolvedTcg || 'External', displayName: resolvedTcg || 'External' } };

      return { edition, totalCards: cards.length, cardsWithStock: 0, cards } as EditionInventory;
    }

    // Fallback: build inventory view from local listings
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

    const edition: any = { id: editionId, editionCode: resolvedSetCode, editionName: resolvedSetCode, tcg: { id: resolvedTcg || 'LOCAL', name: resolvedTcg || 'LOCAL', displayName: resolvedTcg || 'Local' } };

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
  try {
    const response = await apiClient.get('/listings/low-stock', { params: { threshold } });
    return response.data;
  } catch (err) {
    if (isAuthOrScopeError(err)) {
      throw new Error('No autorizado o sin scope de tienda válido para cargar alertas de stock bajo.');
    }
    const th = typeof threshold === 'number' ? threshold : 2;
    const all = localImports.listLocalListings();
    const matched = all.filter((l) => (l.quantity ?? 0) <= th).map(mapLocalToListing);
    return matched;
  }
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
  try {
    const { data } = await apiClient.post('/admin/catalog/reset', { confirm: true });
    return data;
  } catch (_) {
    // Local fallback: clear local imports/listings if confirmation provided
    try {
      localImports.clearLocalListings();
      try { localStorage.removeItem('netdecker.local_import_jobs_v1'); } catch (_) {}
      return { success: true, message: 'Local listings cleared (no backend available).' };
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Failed to reset locally' };
    }
  }
}
