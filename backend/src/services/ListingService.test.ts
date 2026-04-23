import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import { ListingService } from './ListingService.js';

test('getListing returns listing', async () => {
  const originalFindFirst = prisma.listing.findFirst;
  try {
    prisma.listing.findFirst = (async () => ({ id: 'L1', finalPrice: 100 })) as any;
    const listing = await ListingService.getListing('L1');
    assert.equal(listing.id, 'L1');
    assert.equal(listing.finalPrice, 100);
  } finally {
    prisma.listing.findFirst = originalFindFirst;
  }
});

test('createListing rejects when storeId is missing', async () => {
  let threw = false;
  try {
    await ListingService.createListing({
      storeId: '',
      cardId: 'C1',
      condition: 'NM' as any,
      quantity: 0,
      referencePrice: 1,
    });
  } catch (err: any) {
    threw = true;
    assert.ok(String(err.message).includes('storeId is required'));
  }
  assert.equal(threw, true);
});

test('decreaseQuantity throws when listing missing', async () => {
  const originalGetListing = ListingService.getListing;
  try {
    ListingService.getListing = (async () => null) as any;
    let threw = false;
    try {
      await ListingService.decreaseQuantity('missing', 2);
    } catch (err: any) {
      threw = true;
      assert.ok(String(err.message).includes('Listing not found'));
    }
    assert.equal(threw, true);
  } finally {
    ListingService.getListing = originalGetListing;
  }
});

test('updateQuantity clamps negative and sets everHadStock', async () => {
  const originalUpdate = prisma.listing.update;
  try {
    prisma.listing.update = (async (args: any) => ({ id: args.where.id, quantity: args.data.quantity })) as any;
    const updated = await ListingService.updateQuantity('L1', -5);
    assert.equal(updated.quantity, 0);
  } finally {
    prisma.listing.update = originalUpdate;
  }
});

test('bulkUpdateQuantities aggregates errors and successes', async () => {
  const originalUpdateQuantity = ListingService.updateQuantity;
  try {
    ListingService.updateQuantity = (async (id: string, qty: number) => {
      if (id === 'bad') throw new Error('db error');
      return { id, quantity: qty } as any;
    }) as any;

    const res = await ListingService.bulkUpdateQuantities([{ listingId: 'ok', quantity: 1 }, { listingId: 'bad', quantity: 2 }]);
    assert.equal(res.updated, 1);
    assert.equal(res.errors.length, 1);
    assert.equal(res.errors[0].listingId, 'bad');
  } finally {
    ListingService.updateQuantity = originalUpdateQuantity;
  }
});

test('getInventoryValue computes totals', async () => {
  const originalFindMany = prisma.listing.findMany;
  try {
    prisma.listing.findMany = (async () => [
      { quantity: 2, costPrice: 10, finalPrice: 20 },
      { quantity: 3, costPrice: 5, finalPrice: 15 }
    ]) as any;

    const res = await ListingService.getInventoryValue();
    // totalCost = 2*10 + 3*5 = 35
    // totalValue = 2*20 + 3*15 = 40 + 45 = 85
    assert.equal(res.totalCost, 35);
    assert.equal(res.totalValue, 85);
    assert.equal(res.itemCount, 5);
  } finally {
    prisma.listing.findMany = originalFindMany;
  }
});

test('setManualPrice validates input', async () => {
  const originalGetListing = ListingService.getListing;
  try {
    ListingService.getListing = (async () => ({ id: 'L1', finalPrice: 100, referencePrice: 100, exchangeRate: 1 })) as any;
    let threw = false;
    try {
      await ListingService.setManualPrice('L1', -1);
    } catch (err: any) {
      threw = true;
      assert.ok(String(err.message).includes('manualFinalPrice must be a positive number'));
    }
    assert.equal(threw, true);
  } finally {
    ListingService.getListing = originalGetListing;
  }
});
