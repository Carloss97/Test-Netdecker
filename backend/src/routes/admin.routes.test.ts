process.env.SKIP_DB_INIT = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'net';
import express, { Express, Request, Response, NextFunction } from 'express';
import 'express-async-errors';

import adminRoutes from './admin.routes.js';
import prisma from '../utils/db.js';
import { ExchangeRateService } from '../services/ExchangeRateService.js';
import PaymentReconciliationService from '../services/PaymentReconciliationService.js';
import CashSessionService from '../services/CashSessionService.js';
import { CatalogSyncService } from '../services/CatalogSyncService.js';
import { ListingService } from '../services/ListingService.js';
import AuditService from '../services/AuditService.js';
import { isImportSetSyncPricesDefault, setImportSetSyncPricesDefault } from '../config/appConfig.js';
import { RateLimitService } from '../services/RateLimitService.js';

function makeRequest(app: Express, method: string, path: string, body?: unknown, extraHeaders?: Record<string,string>) {
  return new Promise<{ status: number; body: unknown; headers: Record<string, string | string[] | undefined> }>((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      const port = addr.port as number;
      const url = `http://127.0.0.1:${port}${path}`;
      const data = body !== undefined ? JSON.stringify(body) : undefined;
      const options = { method, headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': String(Buffer.byteLength(data)) } : {}), ...(extraHeaders || {}) } };

      const req = httpRequest(url, options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          server.close();
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ status: res.statusCode || 0, body: JSON.parse(raw), headers: res.headers });
          } catch {
            resolve({ status: res.statusCode || 0, body: raw, headers: res.headers });
          }
        });
      });

      req.on('error', (err) => { server.close(); reject(err); });
      if (data) req.write(data);
      req.end();
    });
  });
}

function buildErrorHandler() {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const isAppError = false;
    const statusCode = typeof (err as any)?.statusCode === 'number' ? (err as any).statusCode : 500;
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    const code = typeof (err as any)?.code === 'string' ? (err as any).code : (statusCode >= 500 ? 'INTERNAL_ERROR' : 'ERROR');

    res.status(statusCode).json({ success: false, error: { code, message: isAppError ? message : 'Internal Server Error', statusCode, timestamp: new Date().toISOString() } });
  };
}

test('GET /api/admin/pricing-config returns importSetSyncPricesDefault and POST updates it', async () => {
  // Initialize runtime default
  setImportSetSyncPricesDefault(true);
  assert.equal(isImportSetSyncPricesDefault(), true);

  // Stub prisma listing aggregate to avoid DB access
  const origAggregate = (prisma.listing as any).aggregate;
  (prisma.listing as any).aggregate = async () => ({ _avg: { marginMultiplier: 1.0 }, _count: { _all: 10 } });

  // Stub exchange rate fast lookup to avoid cache/redis/db calls
  const origFast = ExchangeRateService.getUSDtoCLPRateMetaFast;
  ExchangeRateService.getUSDtoCLPRateMetaFast = async () => ({ rate: 900, retrievalSource: 'database', provider: 'manual', fetchedAt: new Date() } as any);
  const origMeta = ExchangeRateService.getUSDtoCLPRateMeta;
  ExchangeRateService.getUSDtoCLPRateMeta = async () => ({ rate: 900, retrievalSource: 'database', provider: 'manual', fetchedAt: new Date() } as any);

  const app = express();
  app.use(express.json());
  // Stub admin session lookup so requireAdmin middleware passes in tests
  const originalAdminSessionFind = (prisma.adminSession as any).findUnique;
  (prisma.adminSession as any).findUnique = async (_args: any) => ({ token: 'faketoken', expiresAt: null, user: { id: 'u-test', email: 'admin@test', role: 'ADMIN', isActive: true } });
  const originalCheckLimit = RateLimitService.checkLimit;
  RateLimitService.checkLimit = (async () => ({ allowed: true, remaining: 49, resetAt: new Date(Date.now() + 60000), source: 'redis' })) as typeof RateLimitService.checkLimit;

  app.use('/api/admin', adminRoutes);
  app.use(buildErrorHandler());

  // First: GET should reflect the runtime default (true)
  let r = await makeRequest(app, 'GET', '/api/admin/pricing-config', undefined, { Authorization: 'Bearer faketoken' });
  assert.equal(r.status, 200);
  assert.equal((r.body as any).success, true);
  assert.equal((r.body as any).config.importSetSyncPricesDefault, true);

  // Now POST to change the runtime default to false
  r = await makeRequest(app, 'POST', '/api/admin/pricing-config', { importSetSyncPricesDefault: false }, { Authorization: 'Bearer faketoken' });
  assert.equal(r.status, 200);
  assert.equal((r.body as any).success, true);
  assert.equal(r.headers['x-ratelimit-limit'], '50');
  assert.equal(r.headers['x-ratelimit-remaining'], '49');

  // The runtime value should be updated
  assert.equal(isImportSetSyncPricesDefault(), false);

  // GET should now return the updated value
  r = await makeRequest(app, 'GET', '/api/admin/pricing-config', undefined, { Authorization: 'Bearer faketoken' });
  assert.equal(r.status, 200);
  assert.equal((r.body as any).config.importSetSyncPricesDefault, false);

  // Restore stubs
  (prisma.listing as any).aggregate = origAggregate;
  ExchangeRateService.getUSDtoCLPRateMetaFast = origFast;
  ExchangeRateService.getUSDtoCLPRateMeta = origMeta;

  // Restore admin session stub
  (prisma.adminSession as any).findUnique = originalAdminSessionFind;
  RateLimitService.checkLimit = originalCheckLimit;

  // Reset runtime default
  setImportSetSyncPricesDefault(true);
});

test('POST /api/admin/pricing-config denies non-global admin sessions', async () => {
  const originalAdminSessionFind = (prisma.adminSession as any).findUnique;
  const originalCheckLimit = RateLimitService.checkLimit;

  try {
    (prisma.adminSession as any).findUnique = async (_args: any) => ({
      token: 'faketoken',
      expiresAt: null,
      storeId: 'store-1',
      user: { id: 'u-manager', email: 'manager@test', role: 'MANAGER', isActive: true },
    });
    RateLimitService.checkLimit = (async () => ({
      allowed: true,
      remaining: 49,
      resetAt: new Date(Date.now() + 60000),
      source: 'redis',
    })) as typeof RateLimitService.checkLimit;

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    app.use(buildErrorHandler());

    const r = await makeRequest(
      app,
      'POST',
      '/api/admin/pricing-config',
      { importSetSyncPricesDefault: false },
      { Authorization: 'Bearer faketoken' },
    );

    assert.equal(r.status, 403);
    assert.equal((r.body as any).success, false);
  } finally {
    (prisma.adminSession as any).findUnique = originalAdminSessionFind;
    RateLimitService.checkLimit = originalCheckLimit;
  }
});

test('POST /api/admin/catalog/reset denies scoped ADMIN session', async () => {
  const originalAdminSessionFind = (prisma.adminSession as any).findUnique;
  const originalCheckLimit = RateLimitService.checkLimit;

  try {
    (prisma.adminSession as any).findUnique = async (_args: any) => ({
      token: 'faketoken',
      expiresAt: null,
      storeId: 'store-1',
      user: { id: 'u-scoped-admin', email: 'admin@store.com', role: 'ADMIN', isActive: true },
    });
    RateLimitService.checkLimit = (async () => ({
      allowed: true,
      remaining: 19,
      resetAt: new Date(Date.now() + 60000),
      source: 'redis',
    })) as typeof RateLimitService.checkLimit;

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    app.use(buildErrorHandler());

    const r = await makeRequest(
      app,
      'POST',
      '/api/admin/catalog/reset',
      { confirm: true },
      { Authorization: 'Bearer faketoken' },
    );

    assert.equal(r.status, 403);
    assert.equal((r.body as any).success, false);
  } finally {
    (prisma.adminSession as any).findUnique = originalAdminSessionFind;
    RateLimitService.checkLimit = originalCheckLimit;
  }
});

test('POST /api/admin/pricing-config returns normalized validation error for invalid manual rate', async () => {
  const originalAdminSessionFind = (prisma.adminSession as any).findUnique;
  const originalCheckLimit = RateLimitService.checkLimit;

  try {
    (prisma.adminSession as any).findUnique = async (_args: any) => ({
      token: 'faketoken',
      expiresAt: null,
      storeId: null,
      user: { id: 'u-global-admin', email: 'admin@test', role: 'ADMIN', isActive: true },
    });
    RateLimitService.checkLimit = (async () => ({
      allowed: true,
      remaining: 49,
      resetAt: new Date(Date.now() + 60000),
      source: 'redis',
    })) as typeof RateLimitService.checkLimit;

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    app.use(buildErrorHandler());

    const r = await makeRequest(
      app,
      'POST',
      '/api/admin/pricing-config',
      { exchangeRateMode: 'manual', manualUsdToClp: 0 },
      { Authorization: 'Bearer faketoken' },
    );

    assert.equal(r.status, 400);
    assert.equal((r.body as any).success, false);
    assert.equal((r.body as any).error.code, 'VALIDATION_ERROR');
    assert.equal((r.body as any).error.statusCode, 400);
  } finally {
    (prisma.adminSession as any).findUnique = originalAdminSessionFind;
    RateLimitService.checkLimit = originalCheckLimit;
  }
});

test('POST /api/admin/tenant/normalize-in-stock-statuses returns updated count for resolved store', async () => {
  const originalAdminSessionFind = (prisma.adminSession as any).findUnique;
  const originalCheckLimit = RateLimitService.checkLimit;
  const originalNormalize = ListingService.normalizeInStockStatuses;

  try {
    (prisma.adminSession as any).findUnique = async (_args: any) => ({
      token: 'faketoken',
      expiresAt: null,
      storeId: 'store-1',
      user: { id: 'u-global-admin', email: 'admin@test', role: 'ADMIN', isActive: true },
    });
    RateLimitService.checkLimit = (async () => ({
      allowed: true,
      remaining: 49,
      resetAt: new Date(Date.now() + 60000),
      source: 'redis',
    })) as typeof RateLimitService.checkLimit;
    ListingService.normalizeInStockStatuses = (async () => ({ updated: 3 })) as any;

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    app.use(buildErrorHandler());

    const r = await makeRequest(
      app,
      'POST',
      '/api/admin/tenant/normalize-in-stock-statuses',
      {},
      { Authorization: 'Bearer faketoken' },
    );

    assert.equal(r.status, 200);
    assert.equal((r.body as any).success, true);
    assert.equal((r.body as any).scopeStoreId, 'store-1');
    assert.equal((r.body as any).updated, 3);
  } finally {
    (prisma.adminSession as any).findUnique = originalAdminSessionFind;
    RateLimitService.checkLimit = originalCheckLimit;
    ListingService.normalizeInStockStatuses = originalNormalize;
  }
});

test('GET /api/admin/reconciliation/reports returns recent reports', async () => {
  const originalAdminSessionFind = (prisma.adminSession as any).findUnique;
  const originalListReports = PaymentReconciliationService.listReports;

  try {
    (prisma.adminSession as any).findUnique = async () => ({
      token: 'faketoken',
      expiresAt: null,
      user: { id: 'u-test', email: 'admin@test', role: 'ADMIN', isActive: true },
    });

    PaymentReconciliationService.listReports = (async (_limit = 30) => [
      {
        id: 'rep_1',
        provider: 'STRIPE',
        status: 'completed',
        totalStripeTransactions: 12,
        totalLocalOrders: 11,
        totalDiscrepancies: 1,
        discrepancies: [{ type: 'STRIPE_ORPHAN' }],
        windowStart: new Date('2026-04-10T00:00:00.000Z'),
        windowEnd: new Date('2026-04-11T00:00:00.000Z'),
        createdAt: new Date('2026-04-11T02:00:00.000Z'),
      },
    ]) as typeof PaymentReconciliationService.listReports;

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    app.use(buildErrorHandler());

    const res = await makeRequest(app, 'GET', '/api/admin/reconciliation/reports?limit=20', undefined, { Authorization: 'Bearer faketoken' });

    assert.equal(res.status, 200);
    assert.equal((res.body as any).success, true);
    assert.equal((res.body as any).total, 1);
    assert.equal((res.body as any).reports[0].id, 'rep_1');
  } finally {
    (prisma.adminSession as any).findUnique = originalAdminSessionFind;
    PaymentReconciliationService.listReports = originalListReports;
  }
});

test('GET /api/admin/reconciliation/reports validates limit query', async () => {
  const originalAdminSessionFind = (prisma.adminSession as any).findUnique;

  try {
    (prisma.adminSession as any).findUnique = async () => ({
      token: 'faketoken',
      expiresAt: null,
      user: { id: 'u-test', email: 'admin@test', role: 'ADMIN', isActive: true },
    });

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    app.use(buildErrorHandler());

    const res = await makeRequest(app, 'GET', '/api/admin/reconciliation/reports?limit=0', undefined, { Authorization: 'Bearer faketoken' });

    assert.equal(res.status, 400);
    assert.equal((res.body as any).success, false);
  } finally {
    (prisma.adminSession as any).findUnique = originalAdminSessionFind;
  }
});

test('POST /api/admin/pos/sessions/:id/close records cash discrepancy', async () => {
  const originalAdminSessionFind = (prisma.adminSession as any).findUnique;
  const originalCloseSession = CashSessionService.closeSession;

  try {
    (prisma.adminSession as any).findUnique = async () => ({
      token: 'faketoken',
      expiresAt: null,
      user: { id: 'u-test', email: 'admin@test', role: 'ADMIN', isActive: true },
    });

    CashSessionService.closeSession = (async (_sessionId: string, params: any) => ({
      id: 'cash-1',
      sessionId: 'cash-1',
      ...params,
      theoreticalAmount: 750,
      discrepancy: -50,
      status: 'DISCREPANCY',
    })) as typeof CashSessionService.closeSession;

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    app.use(buildErrorHandler());

    const res = await makeRequest(app, 'POST', '/api/admin/pos/sessions/cash-1/close', { actualCashAmount: 700, closedBy: 'admin@test' }, { Authorization: 'Bearer faketoken' });

    assert.equal(res.status, 200);
    assert.equal((res.body as any).success, true);
    assert.equal((res.body as any).session.discrepancy, -50);
    assert.equal((res.body as any).session.status, 'DISCREPANCY');
  } finally {
    (prisma.adminSession as any).findUnique = originalAdminSessionFind;
    CashSessionService.closeSession = originalCloseSession;
  }
});

test('GET /api/admin/pos/discrepancies returns logs', async () => {
  const originalAdminSessionFind = (prisma.adminSession as any).findUnique;
  const originalListDiscrepancies = CashSessionService.listDiscrepancies;

  try {
    (prisma.adminSession as any).findUnique = async () => ({
      token: 'faketoken',
      expiresAt: null,
      user: { id: 'u-test', email: 'admin@test', role: 'ADMIN', isActive: true },
    });

    CashSessionService.listDiscrepancies = (async () => [
      {
        id: 'disc-1',
        cashSessionId: 'cash-1',
        storeId: 'store-1',
        actualCashAmount: 700,
        theoreticalAmount: 750,
        discrepancy: -50,
        status: 'OPEN',
        notes: 'cash discrepancy',
        createdAt: new Date('2026-04-23T09:00:00.000Z'),
      },
    ]) as typeof CashSessionService.listDiscrepancies;

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    app.use(buildErrorHandler());

    const res = await makeRequest(app, 'GET', '/api/admin/pos/discrepancies?limit=10', undefined, { Authorization: 'Bearer faketoken' });

    assert.equal(res.status, 200);
    assert.equal((res.body as any).success, true);
    assert.equal((res.body as any).total, 1);
    assert.equal((res.body as any).discrepancies[0].id, 'disc-1');
  } finally {
    (prisma.adminSession as any).findUnique = originalAdminSessionFind;
    CashSessionService.listDiscrepancies = originalListDiscrepancies;
  }
});

test('GET /api/admin/price-volatility returns events even when listing relations are missing', async () => {
  const originalAdminSessionFind = (prisma.adminSession as any).findUnique;
  const originalPriceHistoryFindMany = (prisma.priceHistory as any).findMany;
  const originalListingFindMany = (prisma.listing as any).findMany;

  try {
    (prisma.adminSession as any).findUnique = async () => ({
      token: 'faketoken',
      expiresAt: null,
      user: { id: 'u-test', email: 'admin@test', role: 'ADMIN', isActive: true },
    });

    (prisma.priceHistory as any).findMany = async () => ([
      {
        id: 'ph-1',
        listingId: 'listing-1',
        oldPrice: 100,
        newPrice: 150,
        percentChange: 50,
        createdAt: new Date('2026-04-23T10:00:00.000Z'),
      },
      {
        id: 'ph-2',
        listingId: 'listing-2',
        oldPrice: 200,
        newPrice: 120,
        percentChange: -40,
        createdAt: new Date('2026-04-23T11:00:00.000Z'),
      },
    ]);

    (prisma.listing as any).findMany = async () => ([
      {
        id: 'listing-1',
        card: { cardName: 'Card One', cardCode: '001' },
        edition: { editionCode: 'SET1', editionName: 'Set One' },
      },
    ]);

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    app.use(buildErrorHandler());

    const res = await makeRequest(app, 'GET', '/api/admin/price-volatility?limit=20&window=7d', undefined, { Authorization: 'Bearer faketoken' });

    assert.equal(res.status, 200);
    assert.equal((res.body as any).success, true);
    assert.equal((res.body as any).total, 2);
    assert.equal((res.body as any).events[0].cardName, 'Card One');
    assert.equal((res.body as any).events[1].cardName, 'Unknown card');
  } finally {
    (prisma.adminSession as any).findUnique = originalAdminSessionFind;
    (prisma.priceHistory as any).findMany = originalPriceHistoryFindMany;
    (prisma.listing as any).findMany = originalListingFindMany;
  }
});

test('GET /api/admin/stock-alerts scopes results to the admin session store', async () => {
  const originalAdminSessionFind = (prisma.adminSession as any).findUnique;
  const originalListingFindMany = (prisma.listing as any).findMany;

  try {
    (prisma.adminSession as any).findUnique = async () => ({
      token: 'faketoken',
      expiresAt: null,
      user: { id: 'u-test', email: 'admin@test.com', role: 'ADMIN', isActive: true },
      storeId: 'store-a',
      store: { id: 'store-a', slug: 'store-a', name: 'Store A' },
    });

    let capturedWhere: any = null;
    (prisma.listing as any).findMany = async (args: any) => {
      capturedWhere = args?.where;
      return [
        {
          id: 'listing-1',
          condition: 'NM',
          quantity: 2,
          finalPrice: 100,
          card: { cardName: 'Scoped Card', cardCode: '001', imageUrl: null },
          edition: { editionCode: 'SET1', editionName: 'Set One' },
        },
      ];
    };

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    app.use(buildErrorHandler());

    const res = await makeRequest(app, 'GET', '/api/admin/stock-alerts?threshold=3', undefined, { Authorization: 'Bearer faketoken' });

    assert.equal(res.status, 200);
    assert.equal((res.body as any).success, true);
    assert.equal((res.body as any).total, 1);
    assert.equal((res.body as any).alerts[0].cardName, 'Scoped Card');
    assert.equal(capturedWhere.storeId, 'store-a');
  } finally {
    (prisma.adminSession as any).findUnique = originalAdminSessionFind;
    (prisma.listing as any).findMany = originalListingFindMany;
  }
});

test('GET /api/admin/price-volatility scopes lookup queries to the admin session store', async () => {
  const originalAdminSessionFind = (prisma.adminSession as any).findUnique;
  const originalPriceHistoryFindMany = (prisma.priceHistory as any).findMany;
  const originalListingFindMany = (prisma.listing as any).findMany;

  try {
    (prisma.adminSession as any).findUnique = async () => ({
      token: 'faketoken',
      expiresAt: null,
      user: { id: 'u-test', email: 'admin@test.com', role: 'ADMIN', isActive: true },
      storeId: 'store-a',
      store: { id: 'store-a', slug: 'store-a', name: 'Store A' },
    });

    let capturedPriceHistoryWhere: any = null;
    (prisma.priceHistory as any).findMany = async (args: any) => {
      capturedPriceHistoryWhere = args?.where;
      return [
        {
          id: 'ph-1',
          listingId: 'listing-1',
          oldPrice: 100,
          newPrice: 150,
          percentChange: 50,
          createdAt: new Date('2026-04-23T10:00:00.000Z'),
        },
      ];
    };

    let capturedListingWhere: any = null;
    (prisma.listing as any).findMany = async (args: any) => {
      capturedListingWhere = args?.where;
      return [
        {
          id: 'listing-1',
          card: { cardName: 'Scoped Card', cardCode: '001' },
          edition: { editionCode: 'SET1', editionName: 'Set One' },
        },
      ];
    };

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    app.use(buildErrorHandler());

    const res = await makeRequest(app, 'GET', '/api/admin/price-volatility?limit=20&window=7d', undefined, { Authorization: 'Bearer faketoken' });

    assert.equal(res.status, 200);
    assert.equal((res.body as any).success, true);
    assert.equal((res.body as any).total, 1);
    assert.equal((res.body as any).events[0].cardName, 'Scoped Card');
    assert.equal(capturedPriceHistoryWhere.listing.storeId, 'store-a');
    assert.equal(capturedListingWhere.storeId, 'store-a');
  } finally {
    (prisma.adminSession as any).findUnique = originalAdminSessionFind;
    (prisma.priceHistory as any).findMany = originalPriceHistoryFindMany;
    (prisma.listing as any).findMany = originalListingFindMany;
  }
});

test('POST /api/admin/catalog/sync allows MANAGER when permission is granted', async () => {
  const originalAdminSessionFind = (prisma.adminSession as any).findUnique;
  const originalRolePermissionFindMany = (prisma as any).rolePermission?.findMany;
  const originalCheckLimit = RateLimitService.checkLimit;
  const originalSyncNewSets = CatalogSyncService.syncNewSets;

  try {
    (prisma.adminSession as any).findUnique = async () => ({
      token: 'faketoken',
      expiresAt: null,
      user: { id: 'u-manager', email: 'manager@test.com', role: 'MANAGER', isActive: true },
      storeId: 'store-a',
      store: { id: 'store-a', slug: 'store-a', name: 'Store A' },
    });

    (prisma as any).rolePermission = {
      findMany: async () => [{ action: 'run', resource: 'catalog-sync' }],
    };

    RateLimitService.checkLimit = (async () => ({ allowed: true, remaining: 49, resetAt: new Date(Date.now() + 60000), source: 'redis' })) as typeof RateLimitService.checkLimit;
    CatalogSyncService.syncNewSets = (async () => ({ synced: 1, createdListings: 0, updatedListings: 0 })) as typeof CatalogSyncService.syncNewSets;

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    app.use(buildErrorHandler());

    const res = await makeRequest(app, 'POST', '/api/admin/catalog/sync', { dryRun: true }, { Authorization: 'Bearer faketoken' });

    assert.equal(res.status, 200);
    assert.equal((res.body as any).success, true);
    assert.equal((res.body as any).synced, 1);
  } finally {
    (prisma.adminSession as any).findUnique = originalAdminSessionFind;
    if (originalRolePermissionFindMany) {
      (prisma as any).rolePermission.findMany = originalRolePermissionFindMany;
    }
    RateLimitService.checkLimit = originalCheckLimit;
    CatalogSyncService.syncNewSets = originalSyncNewSets;
  }
});

test('GET /api/admin/tenant/visibility-diagnostics uses x-store-id for global admin', async () => {
  const originalAdminSessionFind = (prisma.adminSession as any).findUnique;
  const originalStoreFindUnique = prisma.store.findUnique;
  const originalListingCount = prisma.listing.count;

  try {
    (prisma.adminSession as any).findUnique = async () => ({
      token: 'faketoken',
      expiresAt: null,
      user: { id: 'u-global', email: 'admin@test.com', role: 'ADMIN', isActive: true },
      storeId: null,
      store: null,
    });

    prisma.store.findUnique = (async (args: any) => {
      if (args?.where?.id === 'store-1') return { id: 'store-1', slug: 'store-one', name: 'Store One' } as any;
      return null;
    }) as any;

    const whereCalls: any[] = [];
    prisma.listing.count = (async (args: any) => {
      whereCalls.push(args?.where || {});
      return 3;
    }) as any;

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    app.use(buildErrorHandler());

    const res = await makeRequest(
      app,
      'GET',
      '/api/admin/tenant/visibility-diagnostics?threshold=4',
      undefined,
      { Authorization: 'Bearer faketoken', 'x-store-id': 'store-1' },
    );

    assert.equal(res.status, 200);
    assert.equal((res.body as any).success, true);
    assert.equal((res.body as any).diagnostics.resolvedStoreId, 'store-1');
    assert.equal((res.body as any).diagnostics.scopeMode, 'store-scoped');
    assert.equal(whereCalls.length, 5);
    assert.equal(whereCalls[0].storeId, 'store-1');
    assert.equal(whereCalls[1].storeId, 'store-1');
    assert.equal(whereCalls[2].storeId, 'store-1');
    assert.equal(whereCalls[3].storeId, 'store-1');
    assert.equal(whereCalls[4].storeId, 'store-1');
  } finally {
    (prisma.adminSession as any).findUnique = originalAdminSessionFind;
    prisma.store.findUnique = originalStoreFindUnique;
    prisma.listing.count = originalListingCount;
  }
});

test('GET /api/admin/tenant/visibility-diagnostics keeps scoped admin pinned store', async () => {
  const originalAdminSessionFind = (prisma.adminSession as any).findUnique;
  const originalStoreFindUnique = prisma.store.findUnique;
  const originalListingCount = prisma.listing.count;

  try {
    (prisma.adminSession as any).findUnique = async () => ({
      token: 'faketoken',
      expiresAt: null,
      user: { id: 'u-scoped', email: 'manager@test.com', role: 'MANAGER', isActive: true },
      storeId: 'store-a',
      store: { id: 'store-a', slug: 'store-a', name: 'Store A' },
    });

    prisma.store.findUnique = (async () => null) as any;

    const whereCalls: any[] = [];
    prisma.listing.count = (async (args: any) => {
      whereCalls.push(args?.where || {});
      return 2;
    }) as any;

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    app.use(buildErrorHandler());

    const res = await makeRequest(
      app,
      'GET',
      '/api/admin/tenant/visibility-diagnostics?threshold=6',
      undefined,
      { Authorization: 'Bearer faketoken', 'x-store-id': 'store-b' },
    );

    assert.equal(res.status, 200);
    assert.equal((res.body as any).success, true);
    assert.equal((res.body as any).diagnostics.resolvedStoreId, 'store-a');
    assert.equal(whereCalls.length, 5);
    assert.equal(whereCalls[0].storeId, 'store-a');
    assert.equal(whereCalls[1].storeId, 'store-a');
    assert.equal(whereCalls[2].storeId, 'store-a');
    assert.equal(whereCalls[3].storeId, 'store-a');
    assert.equal(whereCalls[4].storeId, 'store-a');
  } finally {
    (prisma.adminSession as any).findUnique = originalAdminSessionFind;
    prisma.store.findUnique = originalStoreFindUnique;
    prisma.listing.count = originalListingCount;
  }
});

test('GET /api/admin/tenant/visibility-diagnostics keeps parity contract with stock alerts for same tenant', async () => {
  const originalAdminSessionFind = (prisma.adminSession as any).findUnique;
  const originalListingCount = prisma.listing.count;
  const originalListingFindMany = (prisma.listing as any).findMany;

  try {
    (prisma.adminSession as any).findUnique = async () => ({
      token: 'faketoken',
      expiresAt: null,
      user: { id: 'u-scoped', email: 'manager@test.com', role: 'MANAGER', isActive: true },
      storeId: 'store-a',
      store: { id: 'store-a', slug: 'store-a', name: 'Store A' },
    });

    prisma.listing.count = (async (args: any) => {
      const where = args?.where || {};
      if (where.quantity?.lte === 5) return 2; // low stock
      if (where.quantity?.gt === 0 && where.status?.in) return 4; // available/pricing/storefront
      if (where.quantity?.gt === 0 && where.status?.notIn) return 1; // hidden by status
      if (where.storeId === 'store-a' && !where.quantity && !where.status) return 5; // inventory total
      return 0;
    }) as any;

    (prisma.listing as any).findMany = (async () => ([
      {
        id: 'listing-1',
        condition: 'NM',
        quantity: 2,
        finalPrice: 100,
        card: { cardName: 'Scoped Card 1', cardCode: '001', imageUrl: null },
        edition: { editionCode: 'SET1', editionName: 'Set One' },
      },
      {
        id: 'listing-2',
        condition: 'NM',
        quantity: 1,
        finalPrice: 120,
        card: { cardName: 'Scoped Card 2', cardCode: '002', imageUrl: null },
        edition: { editionCode: 'SET1', editionName: 'Set One' },
      },
    ])) as any;

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    app.use(buildErrorHandler());

    const diagnosticsRes = await makeRequest(
      app,
      'GET',
      '/api/admin/tenant/visibility-diagnostics?threshold=5',
      undefined,
      { Authorization: 'Bearer faketoken' },
    );

    const stockAlertsRes = await makeRequest(
      app,
      'GET',
      '/api/admin/stock-alerts?threshold=5',
      undefined,
      { Authorization: 'Bearer faketoken' },
    );

    assert.equal(diagnosticsRes.status, 200);
    assert.equal(stockAlertsRes.status, 200);
    assert.equal((diagnosticsRes.body as any).diagnostics.resolvedStoreId, 'store-a');
    assert.equal((diagnosticsRes.body as any).diagnostics.counts.pricingListings, 4);
    assert.equal((diagnosticsRes.body as any).diagnostics.counts.storefrontListings, 4);
    assert.equal((diagnosticsRes.body as any).diagnostics.counts.hiddenByStatusListings, 1);
    assert.equal((diagnosticsRes.body as any).diagnostics.counts.lowStockListings, (stockAlertsRes.body as any).total);
  } finally {
    (prisma.adminSession as any).findUnique = originalAdminSessionFind;
    prisma.listing.count = originalListingCount;
    (prisma.listing as any).findMany = originalListingFindMany;
  }
});

test('adminAudit includes role and tenant context in audit payload', async () => {
  const originalAdminSessionFind = (prisma.adminSession as any).findUnique;
  const originalStoreFindUnique = prisma.store.findUnique;
  const originalListingCount = prisma.listing.count;
  const originalAuditLogAction = AuditService.logAction;

  try {
    (prisma.adminSession as any).findUnique = async () => ({
      token: 'faketoken',
      expiresAt: null,
      user: { id: 'u-global', email: 'admin@test.com', role: 'ADMIN', isActive: true },
      storeId: null,
      store: null,
    });

    prisma.store.findUnique = (async (args: any) => {
      if (args?.where?.id === 'store-1') {
        return { id: 'store-1', slug: 'store-one', name: 'Store One' } as any;
      }
      return null;
    }) as any;

    prisma.listing.count = (async () => 1) as any;

    const auditCalls: any[] = [];
    AuditService.logAction = (async (params: any) => {
      auditCalls.push(params);
    }) as typeof AuditService.logAction;

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    app.use(buildErrorHandler());

    const res = await makeRequest(
      app,
      'GET',
      '/api/admin/tenant/visibility-diagnostics?threshold=5',
      undefined,
      { Authorization: 'Bearer faketoken', 'x-store-id': 'store-1' },
    );

    assert.equal(res.status, 200);

    // Wait one event loop turn for response finish handler to flush audit log.
    await new Promise<void>((resolve) => {
      setImmediate(() => resolve());
    });

    assert.ok(auditCalls.length >= 1);
    const call = auditCalls[auditCalls.length - 1];
    assert.equal(call.userId, 'u-global');
    assert.equal(call.action, 'GET /tenant/visibility-diagnostics');
    assert.equal(call.data.role, 'ADMIN');
    assert.equal(call.data.sessionStoreId, null);
    assert.equal(call.data.resolvedStoreId, 'store-1');
    assert.equal(call.data.requestPath, '/tenant/visibility-diagnostics');
  } finally {
    (prisma.adminSession as any).findUnique = originalAdminSessionFind;
    prisma.store.findUnique = originalStoreFindUnique;
    prisma.listing.count = originalListingCount;
    AuditService.logAction = originalAuditLogAction;
  }
});
