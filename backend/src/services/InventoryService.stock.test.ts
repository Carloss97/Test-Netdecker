import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import { InventoryService } from './InventoryService.js';

test('recordStockMovement IN increases listing quantity', async () => {
  const originalTx = prisma.$transaction;

  try {
    let updated: any = null;

    const tx = {
      listing: {
        findUnique: async ({ where }: any) => ({ id: where.id, quantity: 5 }),
        update: async ({ where, data }: any) => { updated = { where, data }; return { id: where.id, quantity: data.quantity }; },
      },
      stockMovement: {
        create: async ({ data }: any) => ({ id: 'mov-1', ...data }),
      }
    } as any;

    prisma.$Transaction = prisma.$transaction; // keep reference if needed
    prisma.$transaction = (async (fn: any) => fn(tx)) as any;

    const mov = await InventoryService.recordStockMovement({ listingId: 'L1', warehouseId: 'W1', quantity: 3, type: 'IN', reference: 'r', performedBy: 'u1' } as any);

    assert.equal(updated.data.quantity, 8);
    assert.equal(mov.id, 'mov-1');
  } finally {
    prisma.$transaction = originalTx;
  }
});

test('recordStockMovement OUT decreases listing quantity', async () => {
  const originalTx2 = prisma.$transaction;

  try {
    let updated: any = null;

    const tx = {
      listing: {
        findUnique: async ({ where }: any) => ({ id: where.id, quantity: 10 }),
        update: async ({ where, data }: any) => { updated = { where, data }; return { id: where.id, quantity: data.quantity }; },
      },
      stockMovement: { create: async ({ data }: any) => ({ id: 'mov-2', ...data }) }
    } as any;

    prisma.$transaction = (async (fn: any) => fn(tx)) as any;

    const mov = await InventoryService.recordStockMovement({ listingId: 'L2', warehouseId: 'W1', quantity: 4, type: 'OUT' } as any);

    assert.equal(updated.data.quantity, 6);
    assert.equal(mov.id, 'mov-2');
  } finally {
    prisma.$transaction = originalTx2;
  }
});

test('recordStockMovement OUT throws on insufficient stock', async () => {
  const originalTx3 = prisma.$transaction;

  try {
    const tx = {
      listing: { findUnique: async ({ where }: any) => ({ id: where.id, quantity: 2 }) },
      stockMovement: { create: async ({ data }: any) => ({ id: 'mov-err', ...data }) }
    } as any;

    prisma.$transaction = (async (fn: any) => fn(tx)) as any;

    await assert.rejects(async () => {
      await InventoryService.recordStockMovement({ listingId: 'L3', quantity: 5, type: 'OUT' } as any);
    }, /Insufficient stock/);
  } finally {
    prisma.$transaction = originalTx3;
  }
});

test('recordStockMovement TRANSFER does not change listing quantity', async () => {
  const originalTx4 = prisma.$transaction;

  try {
    let updateCalled = false;

    const tx = {
      listing: { findUnique: async ({ where }: any) => ({ id: where.id, quantity: 20 }), update: async () => { updateCalled = true; throw new Error('Should not call update for TRANSFER'); } },
      stockMovement: { create: async ({ data }: any) => ({ id: 'mov-3', ...data }) }
    } as any;

    prisma.$transaction = (async (fn: any) => fn(tx)) as any;

    const mov = await InventoryService.recordStockMovement({ listingId: 'L4', fromWarehouseId: 'W1', toWarehouseId: 'W2', quantity: 7, type: 'TRANSFER' } as any);

    assert.equal(updateCalled, false);
    assert.equal(mov.id, 'mov-3');
  } finally {
    prisma.$transaction = originalTx4;
  }
});

test('takeStockSnapshot creates a snapshot with current listing quantity', async () => {
  const originalTx5 = prisma.$transaction;

  try {
    const tx = {
      listing: { findUnique: async ({ where }: any) => ({ id: where.id, quantity: 42 }) },
      stockSnapshot: { create: async ({ data }: any) => ({ id: 'snap-1', ...data }) }
    } as any;

    prisma.$transaction = (async (fn: any) => fn(tx)) as any;

    const snap = await InventoryService.takeStockSnapshot('L5');
    assert.equal(snap.id, 'snap-1');
  } finally {
    prisma.$transaction = originalTx5;
  }
});
