// src/routes/admin.routes.ts
// Admin dashboard endpoints: KPIs, stock alerts, price sync history.

import express, { Request, Response } from 'express';
import prisma from '../utils/db.js';
import { PriceSyncService } from '../services/PriceSyncService.js';
import { ExchangeRateService } from '../services/ExchangeRateService.js';
import { TcgplayerBackfillService } from '../services/TcgplayerBackfillService.js';
import { CatalogBootstrapService } from '../services/CatalogBootstrapService.js';
import { CatalogSyncService } from '../services/CatalogSyncService.js';

const router = express.Router();

/**
 * GET /api/admin/dashboard
 * Returns key business metrics for the admin overview.
 */
router.get('/dashboard', async (_req: Request, res: Response) => {
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
    prisma.listing.count({ where: { status: 'active', quantity: { gt: 0 } } }),
    prisma.listing.count({ where: { status: 'active', quantity: { gt: 0, lte: 5 } } }),
    prisma.listing.count({ where: { status: 'active', quantity: { lte: 0 } } }),
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
    ExchangeRateService.getUSDtoCLPRateMeta().catch(() => null),
  ]);

  // Inventory value (sum of finalPrice * quantity for active listings)
  const inventoryValueResult = await prisma.listing.aggregate({
    where: { status: 'active', quantity: { gt: 0 } },
    _sum: { finalPrice: true },
  });

  const inventoryValueCLP = inventoryValueResult._sum.finalPrice ?? 0;

  // Recent price sync runs
  const recentSyncRuns = await PriceSyncService.getRecentRuns(5);

  res.json({
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
  });
});

/**
 * GET /api/admin/stock-alerts?threshold=5
 * Returns cards with low or zero stock.
 */
router.get('/stock-alerts', async (req: Request, res: Response) => {
  const threshold = parseInt(String(req.query.threshold || '5'), 10) || 5;

  const alerts = await prisma.listing.findMany({
    where: {
      status: 'active',
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
    alerts: alerts.map((a) => ({
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
 * GET /api/admin/price-volatility?limit=20
 * Returns listings with the largest recent price changes.
 */
router.get('/price-volatility', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);

  const volatileChanges = await prisma.priceHistory.findMany({
    where: { reason: 'VOLATILE_ALERT' },
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
    total: volatileChanges.length,
    events: volatileChanges.map((h) => ({
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
    editions: editions.map((e) => ({
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
 * POST /api/admin/backfill/tcgplayer-product-id
 * Body: { limit?: number, offset?: number, dryRun?: boolean, tcg?: 'MAGIC'|'POKEMON'|'YUGIOH'|'ONE_PIECE' }
 */
router.post('/backfill/tcgplayer-product-id', async (req: Request, res: Response) => {
  const tcgRaw = req.body?.tcg ? String(req.body.tcg).toUpperCase() : undefined;
  const tcg = tcgRaw && ['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE'].includes(tcgRaw)
    ? (tcgRaw as 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE')
    : undefined;

  const result = await TcgplayerBackfillService.backfillProductIds({
    limit: req.body?.limit ? parseInt(req.body.limit, 10) : undefined,
    offset: req.body?.offset ? parseInt(req.body.offset, 10) : undefined,
    dryRun: req.body?.dryRun === true || req.body?.dryRun === 'true',
    tcg,
  });

  res.json({
    success: true,
    ...result,
  });
});

/**
 * GET /api/admin/tcgplayer-coverage
 * Returns % of cards with tcgplayerProductId populated, global and by TCG.
 */
router.get('/tcgplayer-coverage', async (_req: Request, res: Response) => {
  const [totalCards, coveredCards, byTcg] = await Promise.all([
    prisma.card.count(),
    prisma.card.count({ where: { tcgplayerProductId: { not: null } } }),
    prisma.tCG.findMany({
      select: {
        name: true,
        displayName: true,
        _count: { select: { cards: true } },
        cards: {
          where: { tcgplayerProductId: { not: null } },
          select: { id: true },
        },
      },
    }),
  ]);

  const globalCoverage = totalCards > 0 ? (coveredCards / totalCards) * 100 : 0;

  res.json({
    success: true,
    global: {
      totalCards,
      coveredCards,
      uncoveredCards: Math.max(totalCards - coveredCards, 0),
      coveragePercent: Number(globalCoverage.toFixed(2)),
    },
    byTcg: byTcg.map((t) => {
      const covered = t.cards.length;
      const total = t._count.cards;
      const coverage = total > 0 ? (covered / total) * 100 : 0;
      return {
        tcg: t.name,
        tcgDisplayName: t.displayName,
        totalCards: total,
        coveredCards: covered,
        uncoveredCards: Math.max(total - covered, 0),
        coveragePercent: Number(coverage.toFixed(2)),
      };
    }),
  });
});

/**
 * POST /api/admin/catalog/bootstrap
 * Body: { tcg?: 'MAGIC'|'POKEMON'|'YUGIOH', setCode?: string, setLimit?: number, dryRun?: boolean, createListings?: boolean, initialQuantity?: number, marginMultiplier?: number }
 */
router.post('/catalog/bootstrap', async (req: Request, res: Response) => {
  const tcgRaw = req.body?.tcg ? String(req.body.tcg).toUpperCase() : undefined;
  const tcg = tcgRaw && ['MAGIC', 'POKEMON', 'YUGIOH'].includes(tcgRaw)
    ? (tcgRaw as 'MAGIC' | 'POKEMON' | 'YUGIOH')
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
router.post('/catalog/sync', async (req: Request, res: Response) => {
  const tcgRaw = req.body?.tcg ? String(req.body.tcg).toUpperCase() : undefined;
  const tcg = tcgRaw && ['MAGIC', 'POKEMON', 'YUGIOH'].includes(tcgRaw)
    ? (tcgRaw as 'MAGIC' | 'POKEMON' | 'YUGIOH')
    : undefined;

  const result = await CatalogSyncService.syncNewSets({
    tcg,
    dryRun: req.body?.dryRun === true || req.body?.dryRun === 'true',
    createListings: req.body?.createListings !== false,
    initialQuantity: req.body?.initialQuantity ? parseInt(req.body.initialQuantity, 10) : 0,
    marginMultiplier: req.body?.marginMultiplier ? parseFloat(req.body.marginMultiplier) : undefined,
    concurrency: req.body?.concurrency ? parseInt(req.body.concurrency, 10) : undefined,
  });

  res.json({ success: true, ...result });
});

export default router;
