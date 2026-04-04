import apiClient from './api';

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

export async function previewListingPrice(referencePrice: number, marginMultiplier: number, roundingMultiple?: number) {
  const { data } = await apiClient.post('/listings/price-preview', {
    referencePrice,
    marginMultiplier,
    roundingMultiple
  });
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
) {
  const { data } = await apiClient.post('/listings/sync-prices', { updates, roundingMultiple, notes });
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
  tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH',
  query: string,
  options: { setCode?: string; page?: number } = {},
) {
  const { data } = await apiClient.get('/external/search', {
    params: { tcg, query, ...options },
  });
  return data;
}

export async function listExternalSets(tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH') {
  const { data } = await apiClient.get('/external/sets', { params: { tcg } });
  return data;
}

export async function getExternalCardById(
  tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH',
  cardId: string,
) {
  const { data } = await apiClient.get(`/external/cards/${tcg}/${cardId}`);
  return data;
}

export async function importExternalCard(params: {
  tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH';
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
  tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH';
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
  tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH';
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

export async function getPriceVolatility(limit?: number) {
  const { data } = await apiClient.get('/admin/price-volatility', {
    params: limit ? { limit } : undefined,
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

export async function bootstrapCatalog(params?: {
  tcg?: 'MAGIC' | 'POKEMON' | 'YUGIOH';
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
  tcg?: 'MAGIC' | 'POKEMON' | 'YUGIOH';
  dryRun?: boolean;
  createListings?: boolean;
  initialQuantity?: number;
  marginMultiplier?: number;
  concurrency?: number;
}) {
  const { data } = await apiClient.post('/admin/catalog/sync', params || {});
  return data;
}
