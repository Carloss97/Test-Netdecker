process.env.SKIP_DB_INIT = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import { StoreHealthService } from './StoreHealthService.js';

test('StoreHealthService returns tenant-scoped operational health metrics', async () => {
  const originalListingCount = prisma.listing.count;
  const originalListingFindMany = prisma.listing.findMany;
  const originalPriceSyncRun = (prisma as any).priceSyncRun;

  try {
    const countCalls: any[] = [];
    const findManyCalls: any[] = [];
    const priceSyncCalls: any[] = [];

    prisma.listing.count = (async (args: any) => {
      countCalls.push(args);
      const where = args?.where || {};
      if (where.quantity?.gt === 0 && where.quantity?.lte === 5) return 2;
      if (where.quantity?.lte === 0 && where.everHadStock === true) return 1;
      if (where.OR) return 3;
      return 8;
    }) as any;

    prisma.listing.findMany = (async (args: any) => {
      findManyCalls.push(args);
      return [
        { id: 'l1', quantity: 2, finalPrice: 1500 },
        { id: 'l2', quantity: 1, finalPrice: 3000 },
      ];
    }) as any;

    (prisma as any).priceSyncRun = {
      findMany: async (args: any) => {
        priceSyncCalls.push({ method: 'findMany', args });
        return [{ id: 'run-failed', status: 'failed', failed: 2, errors: '[{"listingId":"l1","message":"boom"}]', completedAt: new Date('2026-06-01T00:00:00.000Z') }];
      },
      findFirst: async (args: any) => {
        priceSyncCalls.push({ method: 'findFirst', args });
        return { id: 'run-ok', completedAt: new Date('2026-06-02T00:00:00.000Z') };
      },
    };

    const health = await StoreHealthService.getOperationalHealth('store-1', { stalePriceDays: 7, lowStockThreshold: 5 });

    assert.equal(health.storeId, 'store-1');
    assert.equal(health.inventory.totalListings, 8);
    assert.equal(health.inventory.lowStockListings, 2);
    assert.equal(health.inventory.outOfStockListings, 1);
    assert.equal(health.inventory.totalValueCLP, 6000);
    assert.equal(health.pricing.stalePriceListings, 3);
    assert.equal(health.sync.recentFailedRuns.length, 1);
    assert.equal(health.sync.lastSuccessfulSyncAt, '2026-06-02T00:00:00.000Z');
    assert.ok(health.healthScore < 100);

    for (const call of countCalls) {
      assert.equal(call?.where?.storeId, 'store-1');
    }
    for (const call of findManyCalls) {
      assert.equal(call?.where?.storeId, 'store-1');
    }
    for (const call of priceSyncCalls) {
      assert.equal(call.args?.where?.storeId, 'store-1');
    }
  } finally {
    prisma.listing.count = originalListingCount;
    prisma.listing.findMany = originalListingFindMany;
    (prisma as any).priceSyncRun = originalPriceSyncRun;
  }
});
