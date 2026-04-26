process.env.SKIP_DB_INIT = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'net';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import 'express-async-errors';

import listingRoutes from './listing.routes.js';
import adminRoutes from './admin.routes.js';
import prisma from '../utils/db.js';
import { ListingService } from '../services/ListingService.js';

type ListingFixture = {
  id: string;
  storeId: string;
  tcgId: string;
  editionId: string;
  status: 'active' | 'manual' | 'inactive';
  quantity: number;
};

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

      if (payload) req.write(payload);
      req.end();
    });
  });
}

function filterByStore(listings: ListingFixture[], storeId: string) {
  return listings.filter((row) => row.storeId === storeId);
}

function filterAvailable(listings: ListingFixture[]) {
  return listings.filter((row) => row.quantity > 0 && (row.status === 'active' || row.status === 'manual'));
}

function filterLowStock(listings: ListingFixture[], threshold: number) {
  return listings.filter((row) => row.quantity > 0 && row.quantity <= threshold && (row.status === 'active' || row.status === 'manual'));
}

test('cross-page tenant parity contract holds for inventory/pricing/low-stock/storefront', async () => {
  const fixture: ListingFixture[] = [
    { id: 'L1', storeId: 'store-1', tcgId: 'MAGIC', editionId: 'ED1', status: 'active', quantity: 5 },
    { id: 'L2', storeId: 'store-1', tcgId: 'MAGIC', editionId: 'ED1', status: 'manual', quantity: 1 },
    { id: 'L3', storeId: 'store-1', tcgId: 'MAGIC', editionId: 'ED1', status: 'inactive', quantity: 4 },
    { id: 'L4', storeId: 'store-1', tcgId: 'MAGIC', editionId: 'ED1', status: 'active', quantity: 0 },
    { id: 'L5', storeId: 'store-1', tcgId: 'POKEMON', editionId: 'ED2', status: 'active', quantity: 2 },
    { id: 'L6', storeId: 'store-2', tcgId: 'MAGIC', editionId: 'ED1', status: 'active', quantity: 3 },
  ];

  const originalAdminSessionFind = (prisma.adminSession as any).findUnique;
  const originalStoreFindUnique = prisma.store.findUnique;
  const originalListingCount = prisma.listing.count;
  const originalListListings = ListingService.listListings;
  const originalGetAvailableListings = ListingService.getAvailableListings;
  const originalGetLowStockAlerts = ListingService.getLowStockAlerts;

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

    prisma.listing.count = (async (args: any) => {
      const where = args?.where || {};
      const scoped = filterByStore(fixture, String(where.storeId || ''));

      if (!where.status && !where.quantity) {
        // Inventory contract in diagnostics
        return scoped.length;
      }

      if (where.status?.in && where.quantity?.gt === 0 && typeof where.quantity?.lte !== 'number') {
        // Pricing / Storefront contract
        return filterAvailable(scoped).length;
      }

      if (where.status?.in && where.quantity?.gt === 0 && typeof where.quantity?.lte === 'number') {
        // Low-stock contract
        return filterLowStock(scoped, where.quantity.lte).length;
      }

      return 0;
    }) as any;

    ListingService.listListings = (async (options?: { tcgId?: string; editionId?: string; storeId?: string }) => {
      const scoped = filterByStore(fixture, String(options?.storeId || ''));
      return scoped
        .filter((row) => !options?.tcgId || row.tcgId === options.tcgId)
        .filter((row) => !options?.editionId || row.editionId === options.editionId)
        .map((row) => ({ id: row.id } as any));
    }) as typeof ListingService.listListings;

    ListingService.getAvailableListings = (async (tcgId?: string, editionId?: string, storeId?: string) => {
      const scoped = filterByStore(fixture, String(storeId || ''));
      return filterAvailable(scoped)
        .filter((row) => !tcgId || row.tcgId === tcgId)
        .filter((row) => !editionId || row.editionId === editionId)
        .map((row) => ({ id: row.id } as any));
    }) as typeof ListingService.getAvailableListings;

    ListingService.getLowStockAlerts = (async (threshold: number = 5, storeId?: string) => {
      const scoped = filterByStore(fixture, String(storeId || ''));
      return filterLowStock(scoped, threshold).map((row) => ({ id: row.id } as any));
    }) as typeof ListingService.getLowStockAlerts;

    const app = express();
    app.use(express.json());
    app.use('/api/listings', listingRoutes);
    app.use('/api/admin', adminRoutes);
    app.use(errorHandler);

    const tenantHeaders = { Authorization: 'Bearer faketoken', 'x-store-id': 'store-1' };

    const inventoryRes = await makeRequest(app, 'GET', '/api/listings?tcgId=MAGIC&editionId=ED1', undefined, tenantHeaders);
    const pricingRes = await makeRequest(app, 'GET', '/api/listings/available?tcgId=MAGIC&editionId=ED1', undefined, tenantHeaders);
    const storefrontRes = await makeRequest(app, 'GET', '/api/listings/available?tcgId=MAGIC&editionId=ED1', undefined, tenantHeaders);
    const lowStockRes = await makeRequest(app, 'GET', '/api/listings/low-stock?threshold=2', undefined, tenantHeaders);
    const diagnosticsRes = await makeRequest(app, 'GET', '/api/admin/tenant/visibility-diagnostics?threshold=2', undefined, tenantHeaders);

    assert.equal(inventoryRes.status, 200);
    assert.equal(pricingRes.status, 200);
    assert.equal(storefrontRes.status, 200);
    assert.equal(lowStockRes.status, 200);
    assert.equal(diagnosticsRes.status, 200);

    // Shared filter parity for Pricing/Storefront and broader tenant-scope contracts.
    assert.equal((inventoryRes.body as any[]).length, 4);
    assert.equal((pricingRes.body as any[]).length, 2);
    assert.equal((storefrontRes.body as any[]).length, 2);
    assert.equal((lowStockRes.body as any[]).length, 2);

    const counts = (diagnosticsRes.body as any).diagnostics.counts;
    assert.equal(counts.inventoryListings, 5);
    assert.equal(counts.pricingListings, 3);
    assert.equal(counts.storefrontListings, 3);
    assert.equal(counts.lowStockListings, 2);

    // Cross-source consistency: low-stock endpoint and diagnostics low-stock count must match.
    assert.equal((lowStockRes.body as any[]).length, counts.lowStockListings);
  } finally {
    (prisma.adminSession as any).findUnique = originalAdminSessionFind;
    prisma.store.findUnique = originalStoreFindUnique;
    prisma.listing.count = originalListingCount;
    ListingService.listListings = originalListListings;
    ListingService.getAvailableListings = originalGetAvailableListings;
    ListingService.getLowStockAlerts = originalGetLowStockAlerts;
  }
});
