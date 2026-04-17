import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import { PriceSyncService } from '../services/PriceSyncService.js';
import { PriceService } from '../services/PriceService.js';
import PriceThresholdService from '../services/PriceThresholdService.js';

test('runPriceSync persists run via prisma.priceSyncRun delegate', async () => {
  const origPriceSyncRun = (prisma as any).priceSyncRun;
  const origListingFindUnique = prisma.listing.findUnique;
  const origCalculate = PriceService.calculateFinalPrice;
  const origThreshold = PriceThresholdService.getThreshold;
  const origUpdateListing = PriceService.updateListingPrice;

  try {
    const updateCalls: Array<any> = [];

    (prisma as any).priceSyncRun = {
      create: async ({ data }: any) => { return { id: 'run-test-1', ...data }; },
      update: async ({ where, data }: any) => { updateCalls.push({ where, data }); return { id: where.id, ...data }; },
      findMany: async () => [],
      findUnique: async () => null,
    };

    prisma.listing.findUnique = async ({ where }: any) => ({ id: where.id, finalPrice: 100, marginMultiplier: 1, editionId: 'ed1', card: { tcg: { name: 'MAGIC' } } });

    PriceService.calculateFinalPrice = async ({ referencePrice }: any) => {
      const rawFinalPrice = Number(referencePrice) * 2;
      const exchangeRate = 1;
      const roundingMultiple = 1;
      const finalPrice = Math.round(rawFinalPrice);
      return { finalPrice, rawFinalPrice, exchangeRate, referencePrice: Number(referencePrice), roundingMultiple };
    };
    PriceThresholdService.getThreshold = async () => 100000; // high threshold so changes are not volatile
    PriceService.updateListingPrice = async () => { /* noop for test */ };

    const result = await PriceSyncService.runPriceSync({
      source: 'manual',
      updates: [{ listingId: 'L1', referencePrice: 10 }],
      fetchExternalPrices: false,
    });

    assert.equal(result.runId, 'run-test-1');
    assert.equal(result.updated, 1);
    assert.equal(result.failed, 0);
    assert.ok(updateCalls.length >= 1, 'expected at least one update call to priceSyncRun');

    const last = updateCalls[updateCalls.length - 1];
    assert.equal(last.where.id, 'run-test-1');
    assert.equal(last.data.status, 'completed');
  } finally {
    (prisma as any).priceSyncRun = origPriceSyncRun;
    prisma.listing.findUnique = origListingFindUnique;
    PriceService.calculateFinalPrice = origCalculate;
    PriceThresholdService.getThreshold = origThreshold;
    PriceService.updateListingPrice = origUpdateListing;
  }
});
