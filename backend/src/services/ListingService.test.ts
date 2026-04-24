import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import { ListingService } from './ListingService.js';
import AuditService from './AuditService.js';
import { PriceService } from './PriceService.js';

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

test('getListingsByCard forwards store filter when provided', async () => {
  const originalFindMany = prisma.listing.findMany;
  try {
    let receivedArgs: any = null;
    prisma.listing.findMany = (async (args: any) => {
      receivedArgs = args;
      return [{ id: 'L2' }];
    }) as any;

    const listings = await ListingService.getListingsByCard('C1', 'S1');

    assert.equal(listings.length, 1);
    assert.deepEqual(receivedArgs, {
      where: { cardId: 'C1', storeId: 'S1' },
      include: { card: true },
    });
  } finally {
    prisma.listing.findMany = originalFindMany;
  }
});

test('getAvailableListings builds combined card, stock and store filters', async () => {
  const originalFindMany = prisma.listing.findMany;
  try {
    let receivedArgs: any = null;
    prisma.listing.findMany = (async (args: any) => {
      receivedArgs = args;
      return [{ id: 'L3' }];
    }) as any;

    const listings = await ListingService.getAvailableListings('MAGIC', 'ED1', 'S1');

    assert.equal(listings.length, 1);
    assert.deepEqual(receivedArgs.where, {
      AND: [
        { quantity: { gt: 0 } },
        { status: { in: ['active', 'manual'] } },
      ],
      card: { tcgId: 'MAGIC', editionId: 'ED1' },
      storeId: 'S1',
    });
  } finally {
    prisma.listing.findMany = originalFindMany;
  }
});

test('listListings applies pagination and optional store filters', async () => {
  const originalFindMany = prisma.listing.findMany;
  try {
    let receivedArgs: any = null;
    prisma.listing.findMany = (async (args: any) => {
      receivedArgs = args;
      return [{ id: 'L4' }];
    }) as any;

    const listings = await ListingService.listListings({ take: 5, skip: 2, tcgId: 'MAGIC', editionId: 'ED1', storeId: 'S1' });

    assert.equal(listings.length, 1);
    assert.equal(receivedArgs.take, 5);
    assert.equal(receivedArgs.skip, 2);
    assert.deepEqual(receivedArgs.where, {
      card: { tcgId: 'MAGIC', editionId: 'ED1' },
      storeId: 'S1',
    });
  } finally {
    prisma.listing.findMany = originalFindMany;
  }
});

test('getLowStockAlerts and getOutOfStock query the expected stock filters', async () => {
  const originalFindMany = prisma.listing.findMany;
  try {
    const calls: any[] = [];
    prisma.listing.findMany = (async (args: any) => {
      calls.push(args);
      return [];
    }) as any;

    await ListingService.getLowStockAlerts(3, 'S1');
    await ListingService.getOutOfStock('S1');

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].where, {
      AND: [
        { quantity: { lte: 3, gt: 0 } },
        { status: { in: ['active', 'manual'] } },
      ],
      storeId: 'S1',
    });
    assert.deepEqual(calls[1].where, {
      quantity: 0,
      storeId: 'S1',
    });
  } finally {
    prisma.listing.findMany = originalFindMany;
  }
});

test('updateMargin updates listing margin and returns updated record', async () => {
  const originalGetListing = ListingService.getListing;
  const originalUpdate = prisma.listing.update;
  try {
    ListingService.getListing = (async () => ({ id: 'L5', marginMultiplier: 1 })) as any;
    prisma.listing.update = (async (args: any) => ({ id: args.where.id, ...args.data })) as any;

    const updated = await ListingService.updateMargin('L5', 1.35);

    assert.equal(updated.marginMultiplier, 1.35);
  } finally {
    ListingService.getListing = originalGetListing;
    prisma.listing.update = originalUpdate;
  }
});

test('setManualPrice and setApiPricingMode update price history and status', async () => {
  const originalGetListing = ListingService.getListing;
  const originalCalculateFinalPrice = PriceService.calculateFinalPrice;
  const originalTransaction = prisma.$transaction;
  const originalListingUpdate = prisma.listing.update;
  const originalPriceHistoryCreate = prisma.priceHistory.create;
  const originalAudit = AuditService.auditEntityChange;

  try {
    const txListing = { id: 'L6', finalPrice: 100, referencePrice: 10, exchangeRate: 1, status: 'active', marginMultiplier: 1 };
    ListingService.getListing = (async () => txListing as any) as any;
    PriceService.calculateFinalPrice = (async () => ({ finalPrice: 180, rawFinalPrice: 180, exchangeRate: 2, referencePrice: 10, roundingMultiple: 1 })) as any;
    prisma.listing.update = (async (args: any) => ({ id: args.where.id, ...args.data })) as any;
    prisma.priceHistory.create = (async (args: any) => ({ id: 'PH1', ...args.data })) as any;
    prisma.$transaction = (async (operations: any[]) => Promise.all(operations)) as any;
    AuditService.auditEntityChange = (async () => undefined) as any;

    const manual = await ListingService.setManualPrice('L6', 220, 'u-1', 'manual override');
    assert.equal(manual?.id, 'L6');

    const apiMode = await ListingService.setApiPricingMode('L6', 'u-1', 'restore api mode');
    assert.equal(apiMode?.id, 'L6');
  } finally {
    ListingService.getListing = originalGetListing;
    PriceService.calculateFinalPrice = originalCalculateFinalPrice;
    prisma.$transaction = originalTransaction;
    prisma.listing.update = originalListingUpdate;
    prisma.priceHistory.create = originalPriceHistoryCreate;
    AuditService.auditEntityChange = originalAudit;
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
  const originalFindUnique = prisma.listing.findUnique;
  const originalUpdate = prisma.listing.update;
  const originalAudit = AuditService.auditEntityChange;
  try {
    prisma.listing.findUnique = (async () => ({ id: 'L1', quantity: 4 })) as any;
    prisma.listing.update = (async (args: any) => ({ id: args.where.id, quantity: args.data.quantity })) as any;
    AuditService.auditEntityChange = (async () => undefined) as any;
    const updated = await ListingService.updateQuantity('L1', -5);
    assert.equal(updated.quantity, 0);
  } finally {
    prisma.listing.findUnique = originalFindUnique;
    prisma.listing.update = originalUpdate;
    AuditService.auditEntityChange = originalAudit;
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
