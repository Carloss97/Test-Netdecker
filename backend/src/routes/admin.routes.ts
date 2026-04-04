// src/routes/admin.routes.ts
// Admin dashboard endpoints: KPIs, stock alerts, price sync history.

import express, { Request, Response } from 'express';
import prisma from '../utils/db.js';
import { PriceSyncService } from '../services/PriceSyncService.js';
import { ExchangeRateService } from '../services/ExchangeRateService.js';

const router = express.Router();

/**
 * GET /api/admin/dashboard
 * Returns key business metrics for the admin overview.
 */
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/admin/stock-alerts?threshold=5
 * Returns cards with low or zero stock.
 */
router.get('/stock-alerts', async (req: Request, res: Response) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/admin/price-volatility?limit=20
 * Returns listings with the largest recent price changes.
 */
router.get('/price-volatility', async (req: Request, res: Response) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/admin/editions
 * List all editions grouped by TCG with card counts.
 */
router.get('/editions', async (_req: Request, res: Response) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
