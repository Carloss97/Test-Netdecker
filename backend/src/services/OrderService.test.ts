import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import { OrderService } from './OrderService.js';

test('listOrders returns orders and total', async () => {
  const originalFindMany = prisma.order.findMany;
  const originalCount = prisma.order.count;

  try {
    prisma.order.findMany = (async () => [{ id: 'o1' }]) as any;
    prisma.order.count = (async () => 1) as any;

    const res = await OrderService.listOrders({ take: 10, skip: 0 });
    assert.equal(res.total, 1);
    assert.ok(Array.isArray(res.orders));
    assert.equal(res.orders[0].id, 'o1');
  } finally {
    prisma.order.findMany = originalFindMany;
    prisma.order.count = originalCount;
  }
});

test('getOrder throws when not found', async () => {
  const originalFindUnique = prisma.order.findUnique;
  try {
    prisma.order.findUnique = (async () => null) as any;

    let threw = false;
    try {
      await OrderService.getOrder('missing');
    } catch (err: any) {
      threw = true;
      assert.ok(String(err.message).includes('Order not found'));
    }
    assert.equal(threw, true);
  } finally {
    prisma.order.findUnique = originalFindUnique;
  }
});

test('cancelOrder restores stock and marks order cancelled', async () => {
  const originalTransaction = prisma.$Transaction || prisma.$transaction;
  const originalTx = prisma.$transaction;

  try {
    const tx = {
      order: {
        findUnique: async () => ({ id: 'o1', status: 'CONFIRMED', items: [{ listingId: 'L1', quantity: 2 }] }),
        update: async (args: any) => ({ id: args.where.id, status: args.data.status, items: [] }),
      },
      listing: {
        findMany: async () => [{ id: 'L1', quantity: 0 }],
        update: async (args: any) => ({ id: args.where.id, quantity: args.data.quantity }),
      },
      stockMovement: {
        create: async (args: any) => args.data,
      },
    } as any;

    let txCalled = false;
    prisma.$transaction = (async (fn: any) => { txCalled = true; return fn(tx); }) as any;

    const updated = await OrderService.cancelOrder('o1', 'tester');
    assert.equal(txCalled, true);
    assert.equal((updated as { status: string }).status, 'CANCELLED');
  } finally {
    prisma.$transaction = originalTx;
    if (originalTransaction) (prisma as any).$Transaction = originalTransaction;
  }
});

test('cancelOrder throws on already cancelled order', async () => {
  const originalTx = prisma.$transaction;
  try {
    const tx = {
      order: { findUnique: async () => ({ id: 'o1', status: 'CANCELLED', items: [] }) },
    } as any;
    prisma.$transaction = (async (fn: any) => fn(tx)) as any;

    let threw = false;
    try {
      await OrderService.cancelOrder('o1');
    } catch (err: any) {
      threw = true;
      assert.ok(String(err.message).includes('Order already cancelled or refunded'));
    }
    assert.equal(threw, true);
  } finally {
    prisma.$transaction = originalTx;
  }
});

test('shipOrder updates status to SHIPPED', async () => {
  const originalTx = prisma.$transaction;
  try {
    const tx = {
      order: {
        findUnique: async () => ({ id: 'o1', status: 'PENDING' }),
        update: async (args: any) => ({ id: args.where.id, status: args.data.status })
      }
    } as any;

    prisma.$transaction = (async (fn: any) => fn(tx)) as any;
    const updated = await OrderService.shipOrder('o1');
    assert.equal((updated as { status: string }).status, 'SHIPPED');
  } finally {
    prisma.$transaction = originalTx;
  }
});

test('deliverOrder updates status to DELIVERED', async () => {
  const originalTx = prisma.$transaction;
  try {
    const tx = {
      order: {
        findUnique: async () => ({ id: 'o1', status: 'SHIPPED' }),
        update: async (args: any) => ({ id: args.where.id, status: args.data.status })
      }
    } as any;

    prisma.$transaction = (async (fn: any) => fn(tx)) as any;
    const updated = await OrderService.deliverOrder('o1');
    assert.equal((updated as { status: string }).status, 'DELIVERED');
  } finally {
    prisma.$transaction = originalTx;
  }
});
