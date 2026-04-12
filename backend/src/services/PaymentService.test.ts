import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import PaymentService from './PaymentService.js';

test('processPosSale creates order and reduces stock', async () => {
  const originalTx = prisma.$transaction;

  try {
    let orderCreated: any = null;
    const listingUpdates: any[] = [];

    const tx = {
      listing: {
        findMany: async ({ where }: any) => {
          const ids = (where && where.id && where.id.in) || [];
          return ids.map((id: string) => ({ id, quantity: 10, finalPrice: 1000, costPrice: 500, storeId: 'S1' }));
        },
        update: async ({ where, data }: any) => { listingUpdates.push({ where, data }); return { id: where.id, ...data }; }
      },
      order: { create: async ({ data }: any) => { orderCreated = { id: 'o-1', ...data }; return { id: 'o-1', ...data }; } },
      orderItem: { create: async ({ data }: any) => ({ id: 'oi-1', ...data }) },
      stockMovement: { create: async ({ data }: any) => ({ id: 'mov-1', ...data }) },
      account: { findFirst: async () => null },
      journalEntry: { create: async () => ({}) }
    } as any;

    prisma.$transaction = (async (fn: any) => fn(tx)) as any;

    const order: any = await PaymentService.processPosSale({ items: [{ listingId: 'L1', quantity: 2 }] } as any);

    assert.equal(order.id, 'o-1');
    assert.equal(listingUpdates.length, 1);
    assert.equal(listingUpdates[0].data.quantity, 8);
  } finally {
    prisma.$transaction = originalTx;
  }
});

test('processPosSale fails on insufficient stock and does not create order', async () => {
  const originalTx = prisma.$transaction;

  try {
    let orderCreated = false;

    const tx = {
      listing: {
        findMany: async () => [{ id: 'LX', quantity: 1, finalPrice: 1000, costPrice: 400 }],
        update: async () => { orderCreated = true; }
      },
      order: { create: async () => { orderCreated = true; return {}; } },
      orderItem: { create: async () => ({}) },
      stockMovement: { create: async () => ({}) }
    } as any;

    prisma.$transaction = (async (fn: any) => fn(tx)) as any;

    await assert.rejects(async () => {
      await PaymentService.processPosSale({ items: [{ listingId: 'LX', quantity: 2 }] } as any);
    }, /Insufficient stock/);

    assert.equal(orderCreated, false);
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
        update: async ({ where, data }: any) => ({ id: where.id, ...data })
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

    const updated: any = await PaymentService.processPosSale({ items: [{ listingId: 'LJ', quantity: 2 }] } as any);

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
