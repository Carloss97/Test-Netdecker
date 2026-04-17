// src/routes/admin.routes.ts
// Admin dashboard endpoints: KPIs, stock alerts, price sync history.

import express, { Request, Response } from 'express';
import prisma from '../utils/db.js';
import { PriceSyncService } from '../services/PriceSyncService.js';
import { ExchangeRateService } from '../services/ExchangeRateService.js';
import { CatalogBootstrapService } from '../services/CatalogBootstrapService.js';
import { CatalogSyncService } from '../services/CatalogSyncService.js';
import { PriceService } from '../services/PriceService.js';
import { DEFAULT_MARGIN_MULTIPLIER, SUPPORTED_TCGS } from '../config/pricing.js';
import { isImportSetSyncPricesDefault, setImportSetSyncPricesDefault } from '../config/appConfig.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import storesRoutes from './admin.stores.routes.js';
import accountsRoutes from './admin.accounts.routes.js';
import thresholdsRoutes from './admin.thresholds.routes.js';
import approvalsRoutes from './admin.approvals.routes.js';
import requireAdmin, { requireAdminRole } from '../middleware/requireAdmin.js';
import adminAudit from '../middleware/adminAudit.js';

const router = express.Router();

// Expose store management endpoints via API key (used for onboarding/automation)
router.use('/stores', storesRoutes);

// Protect the remaining admin routes with admin authentication + audit
router.use(requireAdmin, adminAudit);

// All routes mounted after this point require admin auth (role checks applied where needed)
router.use('/accounts', accountsRoutes);
router.use('/pricing/thresholds', thresholdsRoutes);
router.use('/approvals', approvalsRoutes);

// Simple in-memory cache for the admin dashboard to keep the UI responsive
let _adminDashboardCache: { ts: number; data: unknown } | null = null;
const ADMIN_DASHBOARD_CACHE_TTL_MS = Number(process.env.ADMIN_DASHBOARD_CACHE_TTL_MS || 15000);

// Simple in-memory cache for the admin dashboard to keep the UI responsive
let _adminDashboardCache: { ts: number; data: unknown } | null = null;
const ADMIN_DASHBOARD_CACHE_TTL_MS = Number(process.env.ADMIN_DASHBOARD_CACHE_TTL_MS || 15000);

type AdminListingAlert = {
  id: string;
  condition: string;
  quantity: number;
  finalPrice: number;
  card: { cardName: string; cardCode: string; imageUrl?: string | null };
  edition: { editionCode: string; editionName: string };
};

type PriceHistoryWithListing = {
  id: string;
  listingId: string;
  oldPrice: number;
  newPrice: number;
  percentChange?: number | null;
  createdAt: Date;
  listing: {
    card: { cardName: string; cardCode: string };
    edition: { editionCode: string; editionName: string };
  };
};

/**
 * GET /api/admin/dashboard
 * Returns key business metrics for the admin overview.
 */
router.get('/dashboard', async (_req: Request, res: Response) => {
  // Serve from short-lived cache when available to keep dashboard snappy
  try {
    if (_adminDashboardCache && Date.now() - _adminDashboardCache.ts < ADMIN_DASHBOARD_CACHE_TTL_MS) {
      return res.json(_adminDashboardCache.data as Record<string, unknown>);
    }
  } catch (err) {
    // ignore cache errors
  }
  const [
    totalCards,
    totalListings,
    activeListings,
    lowStockListings,
    outOfStockListings,
    totalOrders,
    pendingOrders,
    recentImports,
      exchangeRateMeta,
  ] = await Promise.all([
    prisma.card.count(),
    prisma.listing.count(),
    prisma.listing.count({ where: { status: { in: ['active', 'manual'] }, quantity: { gt: 0 } } }),
    prisma.listing.count({ where: { status: { in: ['active', 'manual'] }, quantity: { gt: 0, lte: 5 } } }),
    prisma.listing.count({ where: { status: { in: ['active', 'manual'] }, quantity: { lte: 0 }, everHadStock: true } }),
    prisma.order.count(),
    prisma.order.count({ where: { status: 'PENDING' } }),
    prisma.inventoryImport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        fileName: true,
        status: true,
        totalRecords: true,
        successCount: true,
        failureCount: true,
        createdAt: true,
      },
    }),
    // Use the fast variant to avoid external API calls on dashboard load.
    ExchangeRateService.getUSDtoCLPRateMetaFast().catch(() => null),
  ]);

  // Inventory value (sum of finalPrice * quantity for active listings)
  const inventoryValueResult = await prisma.listing.aggregate({
    where: { status: { in: ['active', 'manual'] }, quantity: { gt: 0 } },
    _sum: { finalPrice: true },
  });

  const inventoryValueCLP = inventoryValueResult._sum.finalPrice ?? 0;

  // Recent price sync runs
  const recentSyncRuns = await PriceSyncService.getRecentRuns(5);

  const responsePayload = {
    success: true,
    kpis: {
      catalog: {
        totalCards,
        totalListings,
        activeListings,
        lowStockListings,
        outOfStockListings,
      },
      inventory: {
        totalValueCLP: inventoryValueCLP,
        currency: 'CLP',
      },
      orders: {
        total: totalOrders,
        pending: pendingOrders,
      },
      exchangeRate: exchangeRateMeta
        ? {
            usdToCLP: exchangeRateMeta.rate,
            source: exchangeRateMeta.retrievalSource,
            fetchedAt: exchangeRateMeta.fetchedAt,
          }
        : null,
    },
    recentImports,
    recentSyncRuns,
  } as const;

  // Cache the assembled response for a short time
  try {
    _adminDashboardCache = { ts: Date.now(), data: responsePayload };
  } catch (err) {
    // ignore cache store errors
  }
  res.json(responsePayload);
});

/**
 * GET /api/admin/stock-alerts?threshold=5
 * Returns cards with low or zero stock.
 */
router.get('/stock-alerts', async (req: Request, res: Response) => {
  const threshold = parseInt(String(req.query.threshold || '5'), 10) || 5;

  const alerts = await prisma.listing.findMany({
    where: {
      status: { in: ['active', 'manual'] },
      everHadStock: true,
      quantity: { lte: threshold },
    },
    include: {
      card: { select: { cardName: true, cardCode: true, imageUrl: true } },
      edition: { select: { editionCode: true, editionName: true } },
    },
    orderBy: { quantity: 'asc' },
    take: 100,
  });

  res.json({
    success: true,
    threshold,
    total: alerts.length,
    alerts: alerts.map((a: AdminListingAlert) => ({
      listingId: a.id,
      cardName: a.card.cardName,
      cardCode: a.card.cardCode,
      editionCode: a.edition.editionCode,
      editionName: a.edition.editionName,
      condition: a.condition,
      quantity: a.quantity,
      finalPrice: a.finalPrice,
      imageUrl: a.card.imageUrl,
    })),
  });
});

/**
 * GET /api/admin/price-volatility?limit=20&window=24h|7d|30d|90d
 * Returns recent volatile changes generated by API-driven updates.
 */
router.get('/price-volatility', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);
  const windowParam = String(req.query.window || '7d').toLowerCase();

  const now = Date.now();
  const windowMsByKey: Record<string, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
  };
  const windowMs = windowMsByKey[windowParam] ?? windowMsByKey['7d'];
  const fromDate = new Date(now - windowMs);

  const volatileChanges = await prisma.priceHistory.findMany({
    where: {
      reason: 'VOLATILE_ALERT',
      oldPrice: { gt: 0 },
      createdAt: { gte: fromDate },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      listing: {
        include: {
          card: { select: { cardName: true, cardCode: true } },
          edition: { select: { editionCode: true, editionName: true } },
        },
      },
    },
  });

  res.json({
    success: true,
    window: windowParam,
    from: fromDate,
    total: volatileChanges.length,
    events: volatileChanges.map((h: PriceHistoryWithListing) => ({
      priceHistoryId: h.id,
      listingId: h.listingId,
      cardName: h.listing.card.cardName,
      editionCode: h.listing.edition.editionCode,
      oldPrice: h.oldPrice,
      newPrice: h.newPrice,
      percentChange: h.percentChange,
      createdAt: h.createdAt,
    })),
  });
});

/**
 * GET /api/admin/editions
 * List all editions grouped by TCG with card counts.
 */
router.get('/editions', async (_req: Request, res: Response) => {
  const editions = await prisma.edition.findMany({
    include: {
      tcg: { select: { name: true, displayName: true } },
      _count: { select: { cards: true, listings: true } },
    },
    orderBy: [{ tcg: { name: 'asc' } }, { editionName: 'asc' }],
  });

  res.json({
    success: true,
    total: editions.length,
    editions: editions.map((e: {
      id: string;
      tcg: { name: string; displayName?: string };
      editionCode: string;
      editionName: string;
      releaseDate?: Date | string | null;
      isActive: boolean;
      _count: { cards: number; listings: number };
    }) => ({
      id: e.id,
      tcg: e.tcg.name,
      tcgDisplayName: e.tcg.displayName,
      editionCode: e.editionCode,
      editionName: e.editionName,
      releaseDate: e.releaseDate,
      isActive: e.isActive,
      cardCount: e._count.cards,
      listingCount: e._count.listings,
    })),
  });
});

/**
 * POST /api/admin/catalog/bootstrap
 * Body: { tcg?: 'MAGIC'|'POKEMON'|'YUGIOH'|'ONE_PIECE'|'DIGIMON'|'WEISS_SCHWARZ', setCode?: string, setLimit?: number, dryRun?: boolean, createListings?: boolean, initialQuantity?: number, marginMultiplier?: number }
 */
router.post('/catalog/bootstrap', requireAdminRole('ADMIN'), async (req: Request, res: Response) => {
  const tcgRaw = req.body?.tcg ? String(req.body.tcg).toUpperCase() : undefined;
  const tcg = tcgRaw && SUPPORTED_TCGS.includes(tcgRaw as typeof SUPPORTED_TCGS[number])
    ? (tcgRaw as typeof SUPPORTED_TCGS[number])
    : undefined;

  const result = await CatalogBootstrapService.bootstrapCatalog({
    tcg,
    setCode: req.body?.setCode ? String(req.body.setCode) : undefined,
    setLimit: req.body?.setLimit ? parseInt(req.body.setLimit, 10) : undefined,
    dryRun: req.body?.dryRun === true || req.body?.dryRun === 'true',
    createListings: req.body?.createListings !== false,
    initialQuantity: req.body?.initialQuantity ? parseInt(req.body.initialQuantity, 10) : 0,
    marginMultiplier: req.body?.marginMultiplier ? parseFloat(req.body.marginMultiplier) : undefined,
  });

  res.json({
    success: true,
    ...result,
  });
});

/**
 * POST /api/admin/catalog/sync
 * Sync only new or changed external sets into the local catalog.
 */
router.post('/catalog/sync', requireAdminRole('ADMIN'), async (req: Request, res: Response) => {
  const tcgRaw = req.body?.tcg ? String(req.body.tcg).toUpperCase() : undefined;
  const tcg = tcgRaw && SUPPORTED_TCGS.includes(tcgRaw as typeof SUPPORTED_TCGS[number])
    ? (tcgRaw as typeof SUPPORTED_TCGS[number])
    : undefined;

  const result = await CatalogSyncService.syncNewSets({
    tcg,
    dryRun: req.body?.dryRun === true || req.body?.dryRun === 'true',
    createListings: req.body?.createListings !== false,
    initialQuantity: req.body?.initialQuantity ? parseInt(req.body.initialQuantity, 10) : 0,
    marginMultiplier: req.body?.marginMultiplier ? parseFloat(req.body.marginMultiplier) : undefined,
    concurrency: req.body?.concurrency ? parseInt(req.body.concurrency, 10) : undefined,
    syncPrices: req.body?.syncPrices === true || req.body?.syncPrices === 'true',
  });

  res.json({ success: true, ...result });
});

/**
 * POST /api/admin/pricing/preview
 * Preview a potential pricing change before persisting.
 *
 * Body:
 * {
 *   listingId?: string,
 *   referencePrice?: number,
 *   marginMultiplier?: number,
 *   roundingMultiple?: number
 * }
 *
 * Usage:
 * - listingId only: previews recalculation using current listing reference + margin.
 * - listingId + overrides: previews applying the override values to that listing.
 * - no listingId: requires referencePrice + marginMultiplier for generic preview.
 */
router.post('/pricing/preview', async (req: Request, res: Response) => {
  const {
    listingId,
    referencePrice,
    marginMultiplier,
    roundingMultiple,
  } = req.body as {
    listingId?: string;
    referencePrice?: number;
    marginMultiplier?: number;
    roundingMultiple?: number;
  };

  const hasListingId = typeof listingId === 'string' && listingId.trim().length > 0;
  const hasExplicitReferencePrice = typeof referencePrice === 'number';
  const hasExplicitMarginMultiplier = typeof marginMultiplier === 'number';

  if (!hasListingId && (!hasExplicitReferencePrice || !hasExplicitMarginMultiplier)) {
    throw new ValidationError('Provide listingId, or provide both referencePrice and marginMultiplier');
  }

  let listing: {
    id: string;
    cardId: string;
    finalPrice: number;
    referencePrice: number;
    marginMultiplier: number;
    card: { cardName: string; cardCode: string };
    edition: { editionCode: string; editionName: string };
  } | null = null;

  if (hasListingId) {
    listing = await prisma.listing.findUnique({
      where: { id: listingId!.trim() },
      include: {
        card: { select: { cardName: true, cardCode: true } },
        edition: { select: { editionCode: true, editionName: true } },
      },
    });

    if (!listing) {
      throw new NotFoundError('Listing not found');
    }
  }

  const nextReferencePrice = hasExplicitReferencePrice
    ? referencePrice!
    : listing!.referencePrice;

  const nextMarginMultiplier = hasExplicitMarginMultiplier
    ? marginMultiplier!
    : listing!.marginMultiplier;

  if (!Number.isFinite(nextReferencePrice) || nextReferencePrice <= 0) {
    throw new ValidationError('referencePrice must be a positive number');
  }

  if (!Number.isFinite(nextMarginMultiplier) || nextMarginMultiplier <= 0) {
    throw new ValidationError('marginMultiplier must be a positive number');
  }

  if (roundingMultiple !== undefined && (!Number.isFinite(roundingMultiple) || roundingMultiple < 1)) {
    throw new ValidationError('roundingMultiple must be a number >= 1 when provided');
  }

  const calculation = await PriceService.calculateFinalPriceDetailed({
    referencePrice: nextReferencePrice,
    marginMultiplier: nextMarginMultiplier,
    roundingMultiple,
  });

  const currentFinalPrice = listing?.finalPrice ?? null;
  const delta = currentFinalPrice === null ? null : calculation.finalPrice - currentFinalPrice;
  const deltaPercent = currentFinalPrice === null
    ? null
    : currentFinalPrice === 0
      ? (calculation.finalPrice > 0 ? 100 : 0)
      : (delta! / currentFinalPrice) * 100;

  res.json({
    success: true,
    listing: listing
      ? {
          id: listing.id,
          cardId: listing.cardId,
          cardName: listing.card.cardName,
          cardCode: listing.card.cardCode,
          editionCode: listing.edition.editionCode,
          editionName: listing.edition.editionName,
          currentReferencePrice: listing.referencePrice,
          currentMarginMultiplier: listing.marginMultiplier,
          currentFinalPrice: listing.finalPrice,
        }
      : null,
    preview: {
      referencePrice: nextReferencePrice,
      marginMultiplier: nextMarginMultiplier,
      exchangeRate: calculation.exchangeRate,
      exchangeRateRetrievalSource: calculation.retrievalSource,
      exchangeRateProvider: calculation.provider || null,
      exchangeRateFetchedAt: calculation.fetchedAt || null,
      exchangeRateExpiresAt: calculation.expiresAt || null,
      roundingMultiple: calculation.roundingMultiple,
      formula: calculation.formula,
      rawFinalPrice: calculation.rawFinalPrice,
      finalPrice: calculation.finalPrice,
      roundedFinalPrice: Math.round(calculation.finalPrice),
      currency: 'CLP',
    },
    diff: {
      delta,
      deltaPercent,
      isVolatile: (await (async () => {
        if (currentFinalPrice === null) return null;
        return await PriceService.isVolatileChange(currentFinalPrice, calculation.finalPrice, listing ? { listingId: listing.id } : undefined);
      })()),
    },
  });
});

/**
 * GET /api/admin/pricing-config
 * Returns pricing configuration and current exchange mode.
 */
router.get('/pricing-config', async (_req: Request, res: Response) => {
  const [exchangeRateMeta, listingStats] = await Promise.all([
    // Use the fast variant here to avoid calling external APIs while loading the admin page
    ExchangeRateService.getUSDtoCLPRateMetaFast().catch(() => null),
    prisma.listing.aggregate({
      _avg: { marginMultiplier: true },
      _count: { _all: true },
    }),
  ]);

  const isManual = !!exchangeRateMeta && exchangeRateMeta.provider === 'manual';

  res.json({
    success: true,
    config: {
      defaultMarginMultiplier: listingStats._avg.marginMultiplier ?? DEFAULT_MARGIN_MULTIPLIER,
      listingCount: listingStats._count._all,
      exchangeRate: {
        mode: isManual ? 'manual' : 'api',
        activeRate: exchangeRateMeta?.rate ?? 0,
        source: exchangeRateMeta?.retrievalSource ?? null,
        provider: exchangeRateMeta?.provider ?? null,
        fetchedAt: exchangeRateMeta?.fetchedAt ?? null,
      },
      importSetSyncPricesDefault: isImportSetSyncPricesDefault(),
    },
  });
});

/**
 * POST /api/admin/pricing-config
 * Body: { defaultMarginMultiplier?: number, applyMarginToExisting?: boolean, exchangeRateMode?: 'api'|'manual', manualUsdToClp?: number }
 */
router.post('/pricing-config', async (req: Request, res: Response) => {
  const {
    defaultMarginMultiplier,
    applyMarginToExisting,
    exchangeRateMode,
    manualUsdToClp,
  } = req.body as {
    defaultMarginMultiplier?: number;
    applyMarginToExisting?: boolean;
    exchangeRateMode?: 'api' | 'manual';
    manualUsdToClp?: number;
  };

  let updatedMargins = 0;
  if (typeof defaultMarginMultiplier === 'number' && Number.isFinite(defaultMarginMultiplier) && defaultMarginMultiplier > 0 && applyMarginToExisting) {
    const marginUpdate = await prisma.listing.updateMany({
      data: { marginMultiplier: defaultMarginMultiplier },
    });
    updatedMargins = marginUpdate.count;
  }

  if (exchangeRateMode === 'manual') {
    if (typeof manualUsdToClp !== 'number' || !Number.isFinite(manualUsdToClp) || manualUsdToClp <= 0) {
      return res.status(400).json({ success: false, error: 'manualUsdToClp must be a positive number when exchangeRateMode=manual' });
    }
    await ExchangeRateService.setManualUSDtoCLPRate(manualUsdToClp);
  }

  if (exchangeRateMode === 'api') {
    await ExchangeRateService.refreshUSDtoCLPRateFromApi();
  }

  const refreshed = await ExchangeRateService.getUSDtoCLPRateMeta();

  // Allow admin to change the runtime default for import-set price sync behaviour
  if (req.body?.importSetSyncPricesDefault !== undefined) {
    const raw = req.body.importSetSyncPricesDefault;
    const enabled = raw === true || raw === 'true' || String(raw) === '1';
    setImportSetSyncPricesDefault(enabled);
  }

  res.json({
    success: true,
    updatedMargins,
    exchangeRate: {
      mode: refreshed.provider === 'manual' ? 'manual' : 'api',
      activeRate: refreshed.rate,
      provider: refreshed.provider || null,
      source: refreshed.retrievalSource,
    },
  });
});

/**
 * POST /api/admin/catalog/reset
 * Deletes all cards, editions, listings, price history, imports.
 * Preserves TCG records and exchange rates.
 * Body: { confirm: true } (safety check)
 */
router.post('/catalog/reset', async (req: Request, res: Response) => {
  if (req.body?.confirm !== true) {
    return res.status(400).json({
      success: false,
      error: 'Must pass { confirm: true } to reset catalog data',
    });
  }

  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.priceHistory.deleteMany();
  // priceSyncRun is accessed via the same delegate pattern used in PriceSyncService
  const priceSyncRunDelegate = (prisma as unknown as Record<string, unknown>)['priceSyncRun'] as
    | { deleteMany: () => Promise<unknown> }
    | undefined;
  if (priceSyncRunDelegate) {
    await priceSyncRunDelegate.deleteMany();
  }
  await prisma.listing.deleteMany();
  await prisma.card.deleteMany();
  await prisma.edition.deleteMany();
  await prisma.inventoryImport.deleteMany();

  res.json({ success: true, message: 'Catalog reset complete. TCG records and exchange rates preserved.' });
});

export default router;
