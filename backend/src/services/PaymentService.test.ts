import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import PaymentService from './PaymentService.js';

// Avoid generating receipts during unit tests
process.env.SKIP_ORDER_RECEIPT_SAVE = 'true';

test('processPosSale creates order and reduces stock', async () => {
  const originalTx = prisma.$transaction;

  try {
    // we don't need to capture created order for this test
    const listingUpdates: any[] = [];

    const tx = {
      listing: {
        findMany: async ({ where }: any) => {
          const ids = (where && where.id && where.id.in) || [];
          return ids.map((id: string) => ({ id, quantity: 10, finalPrice: 1000, costPrice: 500, storeId: 'S1' }));
        },
        updateMany: async ({ where, data }: any) => { listingUpdates.push({ where, data }); return { count: 1 }; }
      },
      order: { create: async ({ data }: any) => ({ id: 'o-1', ...data }) },
      orderItem: { create: async ({ data }: any) => ({ id: 'oi-1', ...data }) },
      stockMovement: { create: async ({ data }: any) => ({ id: 'mov-1', ...data }) },
      account: { findFirst: async () => null },
      journalEntry: { create: async () => ({}) }
    } as any;

    prisma.$transaction = (async (fn: any) => fn(tx)) as any;

    const order: any = await PaymentService.processPosSale({ items: [{ listingId: 'L1', quantity: 2 }] } as any);

    assert.equal(order.id, 'o-1');
    assert.equal(listingUpdates.length, 1);
    assert.equal(listingUpdates[0].where.storeId, 'S1');
    assert.equal(listingUpdates[0].where.quantity.gte, 2);
    assert.equal(listingUpdates[0].data.quantity.decrement, 2);
  } finally {
    prisma.$transaction = originalTx;
  }
});

test('processPosSale fails on insufficient stock before transaction work', async () => {
  const originalTx = prisma.$transaction;

  try {
    let listingUpdated = false;

    const tx = {
      listing: {
        findMany: async () => [{ id: 'LX', quantity: 1, finalPrice: 1000, costPrice: 400, storeId: 'S1' }],
        updateMany: async () => { listingUpdated = true; return { count: 0 }; }
      },
      order: { create: async () => ({}) },
      orderItem: { create: async () => ({}) },
      stockMovement: { create: async () => ({}) }
    } as any;

    prisma.$transaction = (async (fn: any) => fn(tx)) as any;

    await assert.rejects(async () => {
      await PaymentService.processPosSale({ items: [{ listingId: 'LX', quantity: 2 }] } as any);
    }, /Insufficient stock/);

    assert.equal(listingUpdated, false);
  } finally {
    prisma.$transaction = originalTx;
  }
});

test('processPosSale creates journal entries when accounts exist', async () => {
  const originalTx = prisma.$transaction;

  try {
    const created: any[] = [];

    const tx = {
      listing: {
        findMany: async ({ where }: any) => {
          const ids = (where && where.id && where.id.in) || [];
          return ids.map((id: string) => ({ id, quantity: 5, finalPrice: 2000, costPrice: 1200, storeId: 'S1' }));
        },
        updateMany: async ({ where, data }: any) => ({ count: where.storeId === 'S1' && data.quantity.decrement === 2 ? 1 : 0 })
      },
      order: { create: async ({ data }: any) => ({ id: 'o-je', ...data }) },
      orderItem: { create: async ({ data }: any) => ({ id: 'oi-je', ...data }) },
      stockMovement: { create: async ({ data }: any) => ({ id: 'mov-je', ...data }) },
      account: {
        findFirst: async ({ where }: any) => {
          if (where.type === 'REVENUE') return { id: 'acc-rev' };
          if (where.type === 'ASSET') return { id: 'acc-asset' };
          if (where.type === 'EXPENSE') return { id: 'acc-cogs' };
          return null;
        }
      },
      journalEntry: {
        create: async ({ data }: any) => { created.push(data); return { id: `je-${created.length}`, ...data }; }
      }
    } as any;

    prisma.$transaction = (async (fn: any) => fn(tx)) as any;

    await PaymentService.processPosSale({ items: [{ listingId: 'LJ', quantity: 2 }] } as any);

    // Expect two journal entries: sale and COGS
    assert.equal(created.length, 2);

    const sale = created[0];
    const cogs = created[1];

    // sale amount = finalPrice(2000) * qty(2) = 4000
    assert.equal(sale.totalDebit, 4000);
    assert.equal(sale.totalCredit, 4000);
    assert.equal(sale.lines.create.length, 2);
    assert.equal(sale.lines.create[0].accountId, 'acc-asset');
    assert.equal(sale.lines.create[1].accountId, 'acc-rev');

    // cogs amount = costPrice(1200) * qty(2) = 2400
    assert.equal(cogs.totalDebit, 2400);
    assert.equal(cogs.totalCredit, 2400);
    assert.equal(cogs.lines.create[0].accountId, 'acc-cogs');
    assert.equal(cogs.lines.create[1].accountId, 'acc-asset');
  } finally {
    prisma.$transaction = originalTx;
  }
});

test('processPosSale returns existing order when externalReference provided', async () => {
  const originalFindFirst = prisma.order.findFirst;
  const originalFindUnique = prisma.order.findUnique;

  try {
    prisma.order.findFirst = async () => ({ id: 'ord-existing' }) as any;
    prisma.order.findUnique = async () => ({ id: 'ord-existing', orderNumber: 'ORD-EX', items: [] }) as any;

    const order: any = await PaymentService.processPosSale({ items: [{ listingId: 'L1', quantity: 1 }], externalReference: 'ext-123' } as any);
    assert.equal(order.id, 'ord-existing');
  } finally {
    prisma.order.findFirst = originalFindFirst;
    prisma.order.findUnique = originalFindUnique;
  }
});
