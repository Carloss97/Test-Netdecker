process.env.SKIP_DB_INIT = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'net';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import 'express-async-errors';

import listingRoutes from './listing.routes.js';
import prisma from '../utils/db.js';
import { ListingService } from '../services/ListingService.js';
import { PriceSyncService } from '../services/PriceSyncService.js';

function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const statusCode = typeof (err as any)?.statusCode === 'number' ? (err as any).statusCode : 500;
  const code = typeof (err as any)?.code === 'string' ? (err as any).code : (statusCode >= 500 ? 'INTERNAL_ERROR' : 'ERROR');
  const message = err instanceof Error ? err.message : 'Internal Server Error';

  res.status(statusCode).json({ success: false, error: { code, message, statusCode } });
}

function makeRequest(app: Express, method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>) {
  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      const url = `http://127.0.0.1:${addr.port}${path}`;
      const payload = body !== undefined ? JSON.stringify(body) : undefined;
      const headers = {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(payload)) } : {}),
        ...(extraHeaders || {}),
      };

      const req = httpRequest(url, { method, headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          server.close();
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ status: res.statusCode || 0, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode || 0, body: raw });
          }
        });
      });

      req.on('error', (err) => {
        server.close();
        reject(err);
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  });
}

test('GET /api/listings/available requires tenant credentials', async () => {
  const originalGetAvailableListings = ListingService.getAvailableListings;

  try {
    ListingService.getAvailableListings = (async () => ([{ id: 'listing-1', quantity: 2 }])) as typeof ListingService.getAvailableListings;

    const app = express();
    app.use(express.json());
    app.use('/api/listings', listingRoutes);
    app.use(errorHandler);

    const res = await makeRequest(app, 'GET', '/api/listings/available');

    assert.equal(res.status, 401);
    assert.equal((res.body as any).success, false);
  } finally {
    ListingService.getAvailableListings = originalGetAvailableListings;
  }
});

test('GET /api/listings/available resolves store context', async () => {
  const originalGetAvailableListings = ListingService.getAvailableListings;
  const originalStoreFindUnique = prisma.store.findUnique;

  try {
    let receivedStoreId: string | undefined;
    ListingService.getAvailableListings = (async (_tcgId?: string, _editionId?: string, storeId?: string) => {
      receivedStoreId = storeId;
      return [{ id: 'listing-1', quantity: 2 } as any];
    }) as typeof ListingService.getAvailableListings;

    prisma.store.findUnique = (async () => ({ id: 'store-1', slug: 'store-one', name: 'Store One' })) as any;

    const app = express();
    app.use(express.json());
    app.use('/api/listings', listingRoutes);
    app.use(errorHandler);

    const res = await makeRequest(app, 'GET', '/api/listings/available', undefined, { 'x-store-id': 'store-1' });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, [{ id: 'listing-1', quantity: 2 }]);
    assert.equal(receivedStoreId, 'store-1');
  } finally {
    ListingService.getAvailableListings = originalGetAvailableListings;
    prisma.store.findUnique = originalStoreFindUnique;
  }
});

test('GET /api/listings/low-stock resolves store context and forwards threshold', async () => {
  const originalGetLowStockAlerts = ListingService.getLowStockAlerts;
  const originalStoreFindUnique = prisma.store.findUnique;

  try {
    let receivedThreshold: number | null = null;
    let receivedStoreId: string | undefined;
    ListingService.getLowStockAlerts = (async (threshold?: number, storeId?: string) => {
      receivedThreshold = threshold ?? null;
      receivedStoreId = storeId;
      return [{ id: 'listing-low-1', quantity: 1 }];
    }) as typeof ListingService.getLowStockAlerts;

    prisma.store.findUnique = (async () => ({ id: 'store-1', slug: 'store-one', name: 'Store One' })) as any;

    const app = express();
    app.use(express.json());
    app.use('/api/listings', listingRoutes);
    app.use(errorHandler);

    const res = await makeRequest(app, 'GET', '/api/listings/low-stock?threshold=3', undefined, { 'x-store-id': 'store-1' });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, [{ id: 'listing-low-1', quantity: 1 }]);
    assert.equal(receivedThreshold, 3);
    assert.equal(receivedStoreId, 'store-1');
  } finally {
    ListingService.getLowStockAlerts = originalGetLowStockAlerts;
    prisma.store.findUnique = originalStoreFindUnique;
  }
});

test('POST /api/listings/sync-prices scopes run to resolved store', async () => {
  const originalRunPriceSync = PriceSyncService.runPriceSync;
  const originalStoreFindUnique = prisma.store.findUnique;

  try {
    let receivedInput: any = null;
    PriceSyncService.runPriceSync = (async (input: any) => {
      receivedInput = input;
      return {
        runId: 'run-store-1',
        source: 'manual',
        total: 1,
        updated: 1,
        volatile: 0,
        failed: 0,
        roundingMultiple: 1,
        errors: [],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
    }) as typeof PriceSyncService.runPriceSync;

    prisma.store.findUnique = (async () => ({ id: 'store-1', slug: 'store-one', name: 'Store One' })) as any;

    const app = express();
    app.use(express.json());
    app.use('/api/listings', listingRoutes);
    app.use(errorHandler);

    const res = await makeRequest(
      app,
      'POST',
      '/api/listings/sync-prices',
      { updates: [{ listingId: 'listing-1', referencePrice: 5 }] },
      { 'x-store-id': 'store-1' },
    );

    assert.equal(res.status, 200);
    assert.equal(receivedInput?.storeId, 'store-1');
  } finally {
    PriceSyncService.runPriceSync = originalRunPriceSync;
    prisma.store.findUnique = originalStoreFindUnique;
  }
});

test('GET /api/listings/sync-prices/runs scopes history to resolved store', async () => {
  const originalGetRecentRuns = PriceSyncService.getRecentRuns;
  const originalStoreFindUnique = prisma.store.findUnique;

  try {
    let receivedStoreId: string | undefined;
    PriceSyncService.getRecentRuns = (async (_limit?: number, storeId?: string) => {
      receivedStoreId = storeId;
      return [{ id: 'run-store-1', storeId }];
    }) as typeof PriceSyncService.getRecentRuns;

    prisma.store.findUnique = (async () => ({ id: 'store-1', slug: 'store-one', name: 'Store One' })) as any;

    const app = express();
    app.use(express.json());
    app.use('/api/listings', listingRoutes);
    app.use(errorHandler);

    const res = await makeRequest(app, 'GET', '/api/listings/sync-prices/runs?limit=3', undefined, { 'x-store-id': 'store-1' });

    assert.equal(res.status, 200);
    assert.equal(receivedStoreId, 'store-1');
    assert.deepEqual((res.body as any).runs, [{ id: 'run-store-1', storeId: 'store-1' }]);
  } finally {
    PriceSyncService.getRecentRuns = originalGetRecentRuns;
    prisma.store.findUnique = originalStoreFindUnique;
  }
});

test('GET /api/listings/sync-prices/runs/:runId scopes run lookup to resolved store', async () => {
  const originalGetRunById = PriceSyncService.getRunById;
  const originalStoreFindUnique = prisma.store.findUnique;

  try {
    let receivedStoreId: string | undefined;
    PriceSyncService.getRunById = (async (_runId: string, storeId?: string) => {
      receivedStoreId = storeId;
      return storeId === 'store-1' ? { id: 'run-store-1', storeId } : null;
    }) as typeof PriceSyncService.getRunById;

    prisma.store.findUnique = (async () => ({ id: 'store-1', slug: 'store-one', name: 'Store One' })) as any;

    const app = express();
    app.use(express.json());
    app.use('/api/listings', listingRoutes);
    app.use(errorHandler);

    const res = await makeRequest(app, 'GET', '/api/listings/sync-prices/runs/run-store-1', undefined, { 'x-store-id': 'store-1' });

    assert.equal(res.status, 200);
    assert.equal(receivedStoreId, 'store-1');
    assert.deepEqual(res.body, { id: 'run-store-1', storeId: 'store-1' });
  } finally {
    PriceSyncService.getRunById = originalGetRunById;
    prisma.store.findUnique = originalStoreFindUnique;
  }
});
