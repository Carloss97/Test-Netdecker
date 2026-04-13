import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import { runCartCleanup } from './cartCleanup.job.js';

test('runCartCleanup deletes stale carts', async () => {
  const originalFindMany = prisma.cart.findMany;
  const originalDeleteMany = prisma.orderItem.deleteMany;
  const originalCartDelete = prisma.cart.delete;

  try {
    let deletedItemsCalled = 0;
    let deletedCartsCalled = 0;

    prisma.cart.findMany = (async () => ([{ id: 'c1', sessionId: 's1' }])) as any;
    prisma.orderItem.deleteMany = (async () => { deletedItemsCalled++; return { count: 2 }; }) as any;
    prisma.cart.delete = (async (args: any) => { deletedCartsCalled++; return { id: args.where.id }; }) as any;

    const res: any = await runCartCleanup(1);

    assert.equal(res.deletedCarts, 1);
    assert.equal(res.deletedItems, 2);
    assert.equal(deletedItemsCalled, 1);
    assert.equal(deletedCartsCalled, 1);
  } finally {
    prisma.cart.findMany = originalFindMany;
    prisma.orderItem.deleteMany = originalDeleteMany;
    prisma.cart.delete = originalCartDelete;
  }
});

test('runCartCleanup does nothing when no stale carts', async () => {
  const originalFindMany = prisma.cart.findMany;
  const originalDeleteMany = prisma.orderItem.deleteMany;
  const originalCartDelete = prisma.cart.delete;

  try {
    prisma.cart.findMany = (async () => []) as any;

    let deleteCalled = false;
    prisma.orderItem.deleteMany = (async () => { deleteCalled = true; return { count: 0 }; }) as any;
    prisma.cart.delete = (async () => { throw new Error('should not be called'); }) as any;

    const res: any = await runCartCleanup(1);

    assert.equal(res.deletedCarts, 0);
    assert.equal(res.deletedItems, 0);
    assert.equal(deleteCalled, false);
  } finally {
    prisma.cart.findMany = originalFindMany;
    prisma.orderItem.deleteMany = originalDeleteMany;
    prisma.cart.delete = originalCartDelete;
  }
});
