process.env.SKIP_DB_INIT = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import 'express-async-errors';

import listingRoutes from './listing.routes.js';
import adminRoutes from './admin.routes.js';
import prisma from '../utils/db.js';
import { ListingService } from '../services/ListingService.js';

type ImportedListingFixture = {
  id: string;
  storeId: string;
  importId: string;
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

function byStore(rows: ImportedListingFixture[], storeId: string) {
  return rows.filter((row) => row.storeId === storeId);
}

function visibleInPricing(rows: ImportedListingFixture[]) {
  return rows.filter((row) => row.quantity > 0 && (row.status === 'active' || row.status === 'manual'));
}

function visibleInLowStock(rows: ImportedListingFixture[], threshold: number) {
  return rows.filter((row) => row.quantity > 0 && row.quantity <= threshold && (row.status === 'active' || row.status === 'manual'));
}

test('post-import scope contract keeps Inventory/Pricing/LowStock/Diagnostics aligned by tenant', async () => {
  const importedRows: ImportedListingFixture[] = [
    { id: 'imp-L1', storeId: 'store-1', importId: 'import-1', status: 'active', quantity: 8 },
    { id: 'imp-L2', storeId: 'store-1', importId: 'import-1', status: 'manual', quantity: 2 },
    { id: 'imp-L3', storeId: 'store-1', importId: 'import-1', status: 'inactive', quantity: 9 },
    { id: 'imp-L4', storeId: 'store-1', importId: 'import-1', status: 'active', quantity: 0 },
    { id: 'imp-L5', storeId: 'store-2', importId: 'import-2', status: 'active', quantity: 4 },
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
      const scoped = byStore(importedRows, String(where.storeId || ''));

      if (!where.status && !where.quantity) {
        return scoped.length;
      }

      if (where.status?.in && where.quantity?.gt === 0 && typeof where.quantity?.lte !== 'number') {
        return visibleInPricing(scoped).length;
      }

      if (where.status?.in && where.quantity?.gt === 0 && typeof where.quantity?.lte === 'number') {
        return visibleInLowStock(scoped, where.quantity.lte).length;
      }

      return 0;
    }) as any;

    ListingService.listListings = (async (options?: { storeId?: string }) => {
      const scoped = byStore(importedRows, String(options?.storeId || ''));
      return scoped.map((row) => ({ id: row.id } as any));
    }) as typeof ListingService.listListings;

    ListingService.getAvailableListings = (async (_tcgId?: string, _editionId?: string, storeId?: string) => {
      const scoped = byStore(importedRows, String(storeId || ''));
      return visibleInPricing(scoped).map((row) => ({ id: row.id } as any));
    }) as typeof ListingService.getAvailableListings;

    ListingService.getLowStockAlerts = (async (threshold: number = 5, storeId?: string) => {
      const scoped = byStore(importedRows, String(storeId || ''));
      return visibleInLowStock(scoped, threshold).map((row) => ({ id: row.id } as any));
    }) as typeof ListingService.getLowStockAlerts;

    const app = express();
    app.use(express.json());
    app.use('/api/listings', listingRoutes);
    app.use('/api/admin', adminRoutes);
    app.use(errorHandler);

    const headers = { Authorization: 'Bearer faketoken', 'x-store-id': 'store-1' };

    const inventoryRes = await makeRequest(app, 'GET', '/api/listings?take=50', undefined, headers);
    const pricingRes = await makeRequest(app, 'GET', '/api/listings/available', undefined, headers);
    const lowStockRes = await makeRequest(app, 'GET', '/api/listings/low-stock?threshold=5', undefined, headers);
    const diagnosticsRes = await makeRequest(app, 'GET', '/api/admin/tenant/visibility-diagnostics?threshold=5', undefined, headers);

    assert.equal(inventoryRes.status, 200);
    assert.equal(pricingRes.status, 200);
    assert.equal(lowStockRes.status, 200);
    assert.equal(diagnosticsRes.status, 200);

    // Store-1 imported rows: 4 total, 2 visible in pricing (active/manual + qty>0), 1 in low-stock (qty<=5).
    assert.equal((inventoryRes.body as any[]).length, 4);
    assert.equal((pricingRes.body as any[]).length, 2);
    assert.equal((lowStockRes.body as any[]).length, 1);

    const counts = (diagnosticsRes.body as any).diagnostics.counts;
    assert.equal(counts.inventoryListings, 4);
    assert.equal(counts.pricingListings, 2);
    assert.equal(counts.storefrontListings, 2);
    assert.equal(counts.lowStockListings, 1);

    // Contract: diagnostics must match listings endpoints for same tenant and threshold.
    assert.equal((pricingRes.body as any[]).length, counts.pricingListings);
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
