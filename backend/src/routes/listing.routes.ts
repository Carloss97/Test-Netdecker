// src/routes/listing.routes.ts
import express, { Request, Response } from 'express';
import { ListingService } from '../services/ListingService.js';
import { PriceService } from '../services/PriceService.js';
import { ExchangeRateService } from '../services/ExchangeRateService.js';
import { PriceSyncService } from '../services/PriceSyncService.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const router = express.Router();

/**
 * GET /api/listings/available
 * Get available listings with stock
 */
router.get('/available', async (req: Request, res: Response) => {
  const { tcgId, editionId } = req.query;
  const listings = await ListingService.getAvailableListings(
    tcgId as string | undefined,
    editionId as string | undefined
  );
  res.json(listings);
});

/**
 * GET /api/listings/low-stock
 * Get low stock alerts
 */
router.get('/low-stock', async (req: Request, res: Response) => {
  const { threshold } = req.query;
  const listings = await ListingService.getLowStockAlerts(
    parseInt(threshold as string) || 5
  );
  res.json(listings);
});

/**
 * GET /api/listings/inventory-value
 * Get total inventory value
 */
router.get('/inventory-value', async (_req: Request, res: Response) => {
  const value = await ListingService.getInventoryValue();
  res.json(value);
});

/**
 * POST /api/listings/sync-prices
 * Bulk sync listing prices from external reference updates.
 * Body: { updates: [{ listingId: string, referencePrice: number, marginMultiplier?: number }] }
 */
router.post('/sync-prices', async (req: Request, res: Response) => {
  const { updates, roundingMultiple, notes, fetchExternalPrices, tcgName, editionId } = req.body as {
    updates?: Array<{ listingId: string; referencePrice: number; marginMultiplier?: number }>;
    roundingMultiple?: number;
    notes?: string;
    fetchExternalPrices?: boolean;
    tcgName?: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE';
    editionId?: string;
  };

  if (updates !== undefined && (!Array.isArray(updates) || !updates.length)) {
    throw new ValidationError('updates must be a non-empty array when provided');
  }

  const result = await PriceSyncService.runPriceSync({
    source: 'manual',
    updates,
    notes: notes || 'Manual sync via API',
    changedBy: 'system',
    roundingMultiple,
    tcgName,
    editionId,
    // For manual sync without explicit updates, fetch external prices by default.
    fetchExternalPrices: typeof fetchExternalPrices === 'boolean'
      ? fetchExternalPrices
      : updates === undefined,
  });

  res.json(result);
});

/**
 * GET /api/listings/sync-prices/runs
 * List recent price sync runs for traceability.
 */
router.get('/sync-prices/runs', async (req: Request, res: Response) => {
  const { limit } = req.query;
  const runs = await PriceSyncService.getRecentRuns(parseInt(limit as string) || 20);
  res.json({ runs });
});

/**
 * GET /api/listings/sync-prices/runs/:runId
 * Get details of one price sync run.
 */
router.get('/sync-prices/runs/:runId', async (req: Request, res: Response) => {
  const run = await PriceSyncService.getRunById(req.params.runId);
  if (!run) {
    throw new NotFoundError('Sync run not found');
  }
  res.json(run);
});

/**
 * POST /api/listings/price-preview
 * Preview final CLP price from reference USD + margin with current exchange rate.
 */
router.post('/price-preview', async (req: Request, res: Response) => {
  const { referencePrice, marginMultiplier } = req.body as {
    referencePrice?: number;
    marginMultiplier?: number;
    roundingMultiple?: number;
  };

  if (typeof referencePrice !== 'number' || referencePrice <= 0) {
    throw new ValidationError('referencePrice must be a positive number');
  }

  if (typeof marginMultiplier !== 'number' || marginMultiplier <= 0) {
    throw new ValidationError('marginMultiplier must be a positive number');
  }

  const calculation = await PriceService.calculateFinalPriceDetailed({
    referencePrice,
    marginMultiplier,
    roundingMultiple: req.body.roundingMultiple,
  });

  res.json({
    referencePrice,
    marginMultiplier,
    exchangeRate: calculation.exchangeRate,
    exchangeRateRetrievalSource: calculation.retrievalSource,
    exchangeRateProvider: calculation.provider || null,
    exchangeRateFetchedAt: calculation.fetchedAt || null,
    exchangeRateExpiresAt: calculation.expiresAt || null,
    finalPrice: calculation.finalPrice,
    rawFinalPrice: calculation.rawFinalPrice,
    formula: calculation.formula,
    roundedFinalPrice: Math.round(calculation.finalPrice),
    roundingMultiple: calculation.roundingMultiple,
    currency: 'CLP',
  });
});

/**
 * GET /api/listings/price-history/export
 * Export full price history as CSV (all records, no pagination cap).
 * Query params: listingId?, from?, to?, limit? (default: no limit)
 */
router.get('/price-history/export', async (req: Request, res: Response) => {
  const { listingId, from, to } = req.query;

  const fromDate = from ? new Date(String(from)) : undefined;
  const toDate = to ? new Date(String(to)) : undefined;

  if (fromDate && Number.isNaN(fromDate.getTime())) {
    throw new ValidationError('Invalid "from" date');
  }
  if (toDate && Number.isNaN(toDate.getTime())) {
    throw new ValidationError('Invalid "to" date');
  }

  const history = await PriceService.getPriceHistoryForExport({
    listingId: listingId as string | undefined,
    from: fromDate,
    to: toDate,
  });

  const header = ['id', 'listingId', 'oldPrice', 'newPrice', 'oldReferencePrice', 'newReferencePrice', 'oldExchangeRate', 'newExchangeRate', 'percentChange', 'reason', 'changedBy', 'notes', 'createdAt'];
  const rows = history.map((h) => [
    h.id,
    h.listingId,
    String(h.oldPrice),
    String(h.newPrice),
    String(h.oldReferencePrice),
    String(h.newReferencePrice),
    String(h.oldExchangeRate),
    String(h.newExchangeRate),
    String(h.percentChange ?? ''),
    h.reason,
    h.changedBy || '',
    h.notes || '',
    h.createdAt.toISOString(),
  ]);

  const csv = [header, ...rows]
    .map((cols) => cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="price-history.csv"');
  res.send(csv);
});

/**
 * GET /api/listings/card/:cardId
 * Get listings by card
 */
router.get('/card/:cardId', async (req: Request, res: Response) => {
  const listings = await ListingService.getListingsByCard(req.params.cardId);
  res.json(listings);
});

/**
 * GET /api/listings/:id/price-debug
 * Show how current listing price compares against a recalculation with current USD/CLP.
 */
router.get('/:id/price-debug', async (req: Request, res: Response) => {
  const listing = await ListingService.getListing(req.params.id);
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }

  const currentRateMeta = await ExchangeRateService.getUSDtoCLPRateMeta();
  const recalculation = await PriceService.calculateFinalPrice({
    referencePrice: listing.referencePrice,
    marginMultiplier: listing.marginMultiplier,
  });
  const recalculatedFinalPrice = recalculation.finalPrice;
  const delta = recalculatedFinalPrice - listing.finalPrice;
  const deltaPercent = listing.finalPrice === 0 ? 0 : (delta / listing.finalPrice) * 100;
  const recentHistory = await PriceService.getPriceHistory(listing.id, 10);

  res.json({
    listingId: listing.id,
    cardId: listing.cardId,
    cardName: listing.card.cardName,
    condition: listing.condition,
    quantity: listing.quantity,
    pricing: {
      storedReferencePrice: listing.referencePrice,
      storedMarginMultiplier: listing.marginMultiplier,
      storedExchangeRate: listing.exchangeRate,
      storedFinalPrice: listing.finalPrice,
      storedLastSyncedAt: listing.lastSyncedAt,
    },
    currentExchangeRate: {
      rate: currentRateMeta.rate,
      retrievalSource: currentRateMeta.retrievalSource,
      provider: currentRateMeta.provider || null,
      fetchedAt: currentRateMeta.fetchedAt || null,
      expiresAt: currentRateMeta.expiresAt || null,
    },
    recalculation: {
      formula: `${listing.referencePrice} * ${listing.marginMultiplier} * ${currentRateMeta.rate}`,
      rawRecalculatedFinalPrice: recalculation.rawFinalPrice,
      recalculatedFinalPrice,
      roundedRecalculatedFinalPrice: Math.round(recalculatedFinalPrice),
      roundingMultiple: recalculation.roundingMultiple,
      delta,
      deltaPercent,
      isVolatile: PriceService.isVolatileChange(listing.finalPrice, recalculatedFinalPrice),
    },
    recentHistory,
  });
});

/**
 * GET /api/listings/:id
 * Get listing by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  const listing = await ListingService.getListing(req.params.id);
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }
  res.json(listing);
});

/**
 * POST /api/listings/batch-stock
 * Bulk update quantities for multiple listings.
 * Body: { updates: [{ listingId: string, quantity: number }] }
 */
router.post('/batch-stock', async (req: Request, res: Response) => {
  const { updates } = req.body as { updates?: Array<{ listingId: string; quantity: number }> };

  if (!Array.isArray(updates) || updates.length === 0) {
    throw new ValidationError('updates must be a non-empty array');
  }

  for (const update of updates) {
    if (typeof update.listingId !== 'string' || !update.listingId) {
      throw new ValidationError('Each update must have a valid listingId string');
    }
    if (typeof update.quantity !== 'number' || update.quantity < 0) {
      throw new ValidationError(`quantity must be a non-negative number (listingId: ${update.listingId})`);
    }
  }

  const results = await ListingService.bulkUpdateQuantities(updates);
  res.json({ success: true, updated: results.updated, results });
});

// PATCH /api/listings/:id/stock
// Modifica el stock manualmente (sumar/restar/setear cantidad)
// Body: { op: 'set'|'inc'|'dec', value: number }
router.patch('/:id/stock', async (req: Request, res: Response) => {
  const { op, value } = req.body as { op: 'set'|'inc'|'dec'; value: number };
  if (!['set','inc','dec'].includes(op) || typeof value !== 'number') {
    throw new ValidationError('Invalid op or value');
  }
  const listing = await ListingService.getListing(req.params.id);
  if (!listing) throw new NotFoundError('Listing not found');
  let newQty = listing.quantity;
  if (op === 'set') newQty = value;
  if (op === 'inc') newQty += value;
  if (op === 'dec') newQty -= value;
  if (newQty < 0) newQty = 0;
  const updated = await ListingService.updateQuantity(listing.id, newQty);
  res.json({ success: true, listingId: listing.id, quantity: updated.quantity });
});

export default router;
