import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import { InventoryService } from './InventoryService.js';

test('transferStock moves quantity between warehouses (both exist)', async () => {
  const originalTx = prisma.$transaction;

  try {
    let fromUpdated: any = null;
    let toUpdated: any = null;

    const tx = {
      listing: { findUnique: async ({ where }: any) => ({ id: where.id, quantity: 100 }) },
      warehouseStock: {
        findFirst: async ({ where }: any) => {
          if (where.warehouseId === 'W1') return { id: 'ws-from', quantity: 10 };
          if (where.warehouseId === 'W2') return { id: 'ws-to', quantity: 2 };
          return null;
        },
        update: async ({ where, data }: any) => {
          if (where.id === 'ws-from') { fromUpdated = { where, data }; return { id: where.id, ...data }; }
          if (where.id === 'ws-to') { toUpdated = { where, data }; return { id: where.id, ...data }; }
          return null;
        },
        create: async ({ data }: any) => ({ id: 'ws-new', ...data }),
      },
      stockMovement: { create: async ({ data }: any) => ({ id: 'mov-t1', ...data }) }
    } as any;

    prisma.$transaction = (async (fn: any) => fn(tx)) as any;

    const mov = await InventoryService.transferStock({ listingId: 'L1', fromWarehouseId: 'W1', toWarehouseId: 'W2', quantity: 3, performedBy: 'u1' } as any);

    assert.equal(mov.id, 'mov-t1');
    assert.equal(fromUpdated.data.quantity, 7);
    assert.equal(toUpdated.data.quantity, 5);
  } finally {
    prisma.$transaction = originalTx;
  }
});

test('transferStock creates destination warehouse stock when missing', async () => {
  const originalTx = prisma.$transaction;

  try {
    let fromUpdated: any = null;
    let createdTo: any = null;

    const tx = {
      listing: { findUnique: async ({ where }: any) => ({ id: where.id, quantity: 50 }) },
      warehouseStock: {
        findFirst: async ({ where }: any) => {
          if (where.warehouseId === 'W1') return { id: 'ws-from', quantity: 4 };
          return null;
        },
        update: async ({ where, data }: any) => { fromUpdated = { where, data }; return { id: where.id, ...data }; },
        create: async ({ data }: any) => { createdTo = data; return { id: 'ws-new', ...data }; },
      },
      stockMovement: { create: async ({ data }: any) => ({ id: 'mov-t2', ...data }) }
    } as any;

    prisma.$transaction = (async (fn: any) => fn(tx)) as any;

    const mov = await InventoryService.transferStock({ listingId: 'L2', fromWarehouseId: 'W1', toWarehouseId: 'W3', quantity: 3 } as any);

    assert.equal(mov.id, 'mov-t2');
    assert.equal(fromUpdated.data.quantity, 1);
    assert.equal(createdTo.quantity, 3);
  } finally {
    prisma.$transaction = originalTx;
  }
});

test('transferStock fails on insufficient source stock', async () => {
  const originalTx = prisma.$transaction;

  try {
    const tx = {
      listing: { findUnique: async ({ where }: any) => ({ id: where.id, quantity: 5 }) },
      warehouseStock: { findFirst: async ({ where }: any) => ({ id: 'ws-from', quantity: 2 }) },
      stockMovement: { create: async ({ data }: any) => ({ id: 'mov-t3', ...data }) }
    } as any;

    prisma.$transaction = (async (fn: any) => fn(tx)) as any;

    await assert.rejects(async () => {
      await InventoryService.transferStock({ listingId: 'L3', fromWarehouseId: 'W1', toWarehouseId: 'W2', quantity: 5 } as any);
    }, /Insufficient stock/);
  } finally {
    prisma.$transaction = originalTx;
  }
});
