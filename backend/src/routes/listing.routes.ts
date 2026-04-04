// src/routes/listing.routes.ts
import express, { Request, Response } from 'express';
import { ListingService } from '../services/ListingService.js';
import { PriceService } from '../services/PriceService.js';
import { ExchangeRateService } from '../services/ExchangeRateService.js';
import { PriceSyncService } from '../services/PriceSyncService.js';

const router = express.Router();

/**
 * GET /api/listings/available
 * Get available listings with stock
 */
router.get('/available', async (req: Request, res: Response) => {
  try {
    const { tcgId, editionId } = req.query;
    const listings = await ListingService.getAvailableListings(
      tcgId as string | undefined,
      editionId as string | undefined
    );
    res.json(listings);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/listings/low-stock
 * Get low stock alerts
 */
router.get('/low-stock', async (req: Request, res: Response) => {
  try {
    const { threshold } = req.query;
    const listings = await ListingService.getLowStockAlerts(
      parseInt(threshold as string) || 5
    );
    res.json(listings);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/listings/inventory-value
 * Get total inventory value
 */
router.get('/inventory-value', async (req: Request, res: Response) => {
  try {
    const value = await ListingService.getInventoryValue();
    res.json(value);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/listings/sync-prices
 * Bulk sync listing prices from external reference updates.
 * Body: { updates: [{ listingId: string, referencePrice: number, marginMultiplier?: number }] }
 */
router.post('/sync-prices', async (req: Request, res: Response) => {
  try {
    const { updates, roundingMultiple, notes } = req.body as {
      updates?: Array<{ listingId: string; referencePrice: number; marginMultiplier?: number }>;
      roundingMultiple?: number;
      notes?: string;
    };

    if (updates !== undefined && (!Array.isArray(updates) || !updates.length)) {
      return res.status(400).json({ error: 'updates must be a non-empty array when provided' });
    }

    const result = await PriceSyncService.runPriceSync({
      source: 'manual',
      updates,
      notes: notes || 'Manual sync via API',
      changedBy: 'system',
      roundingMultiple,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/listings/sync-prices/runs
 * List recent price sync runs for traceability.
 */
router.get('/sync-prices/runs', async (req: Request, res: Response) => {
  try {
    const { limit } = req.query;
    const runs = await PriceSyncService.getRecentRuns(parseInt(limit as string) || 20);
    res.json({ runs });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/listings/sync-prices/runs/:runId
 * Get details of one price sync run.
 */
router.get('/sync-prices/runs/:runId', async (req: Request, res: Response) => {
  try {
    const run = await PriceSyncService.getRunById(req.params.runId);
    if (!run) {
      return res.status(404).json({ error: 'Sync run not found' });
    }
    res.json(run);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/listings/price-preview
 * Preview final CLP price from reference USD + margin with current exchange rate.
 */
router.post('/price-preview', async (req: Request, res: Response) => {
  try {
    const { referencePrice, marginMultiplier } = req.body as {
      referencePrice?: number;
      marginMultiplier?: number;
      roundingMultiple?: number;
    };

    if (typeof referencePrice !== 'number' || referencePrice <= 0) {
      return res.status(400).json({ error: 'referencePrice must be a positive number' });
    }

    if (typeof marginMultiplier !== 'number' || marginMultiplier <= 0) {
      return res.status(400).json({ error: 'marginMultiplier must be a positive number' });
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
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/listings/card/:cardId
 * Get listings by card
 */
router.get('/card/:cardId', async (req: Request, res: Response) => {
  try {
    const listings = await ListingService.getListingsByCard(req.params.cardId);
    res.json(listings);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/listings/:id/price-debug
 * Show how current listing price compares against a recalculation with current USD/CLP.
 */
router.get('/:id/price-debug', async (req: Request, res: Response) => {
  try {
    const listing = await ListingService.getListing(req.params.id);
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
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
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/listings/:id
 * Get listing by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const listing = await ListingService.getListing(req.params.id);
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    res.json(listing);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
