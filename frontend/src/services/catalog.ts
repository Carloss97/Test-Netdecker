import apiClient from './api';
import type { EditionWithCounts, EditionInventory, Listing } from '../types';

export async function getTCGs() {
  const { data } = await apiClient.get('/tcgs');
  return data;
}

export async function getTCGById(id: string) {
  const { data } = await apiClient.get(`/tcgs/${id}`);
  return data;
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
  const { data } = await apiClient.get('/listings/available', {
    params: { tcgId, editionId }
  });
  return data;
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
  const { data } = await apiClient.get('/listings/inventory-value');
  return data;
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
  options: { setCode?: string; page?: number } = {},
) {
  const { data } = await apiClient.get('/external/search', {
    params: { tcg, query, ...options },
  });
  return data;
}


export async function listExternalSets(tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ') {
  const { data } = await apiClient.get('/external/sets', { params: { tcg } });
  return data;
}


export async function getExternalCardById(
  tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ',
  cardId: string,
) {
  const { data } = await apiClient.get(`/external/cards/${tcg}/${cardId}`);
  return data;
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
  const { data } = await apiClient.post('/external/import/card', params);
  return data;
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
  const { data } = await apiClient.post('/external/import/search', params);
  return data;
}


export async function importExternalSet(params: {
  tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';
  setCode: string;
  createListing?: boolean;
  marginMultiplier?: number;
}) {
  const { data } = await apiClient.post('/external/import/set', params);
  return data;
}

// ─────────────────────────────────────────────
// Admin dashboard API
// ─────────────────────────────────────────────

export async function getAdminDashboard() {
  const { data } = await apiClient.get('/admin/dashboard');
  return data;
}

export async function getStockAlerts(threshold?: number) {
  const { data } = await apiClient.get('/admin/stock-alerts', {
    params: threshold ? { threshold } : undefined,
  });
  return data;
}

export async function getPriceVolatility(limit?: number, window?: '24h' | '7d' | '30d' | '90d') {
  const { data } = await apiClient.get('/admin/price-volatility', {
    params: {
      ...(limit ? { limit } : {}),
      ...(window ? { window } : {}),
    },
  });
  return data;
}

export async function getAdminEditions() {
  const { data } = await apiClient.get('/admin/editions');
  return data;
}

export async function getTcgplayerCoverage() {
  const { data } = await apiClient.get('/admin/tcgplayer-coverage');
  return data;
}

export async function getAdminPricingConfig() {
  const { data } = await apiClient.get('/admin/pricing-config');
  return data;
}

export async function updateAdminPricingConfig(params: {
  defaultMarginMultiplier?: number;
  applyMarginToExisting?: boolean;
  exchangeRateMode?: 'api' | 'manual';
  manualUsdToClp?: number;
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
  const response = await apiClient.get('/editions', { params });
  return response.data;
}

/** Retrieves a single edition with its metadata and card/listing counts. */
export async function getEditionById(id: string): Promise<EditionWithCounts> {
  const response = await apiClient.get(`/editions/${id}`);
  return response.data;
}

/** Retrieves all cards in an edition along with their listings — used for inventory management. */
export async function getEditionCardsWithStock(editionId: string): Promise<EditionInventory> {
  const response = await apiClient.get(`/editions/${editionId}/cards-with-stock`);
  return response.data;
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
