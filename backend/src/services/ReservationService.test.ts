import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import { ReservationService } from './ReservationService.js';

test('createReservation creates a reservation record', async () => {
  const originalTx = prisma.$transaction;

  try {
    const tx = {
      listing: { findUnique: async ({ where }: any) => ({ id: where.id, quantity: 10 }) },
      reservation: { create: async ({ data }: any) => ({ id: 'r-1', ...data }) }
    } as any;

    prisma.$transaction = (async (fn: any) => fn(tx)) as any;

    const r = await ReservationService.createReservation({ listingId: 'L100', warehouseId: 'W1', quantity: 2, reservedBy: 'order-1' } as any);

    assert.equal(r.id, 'r-1');
    assert.equal(r.quantity, 2);
  } finally {
    prisma.$transaction = originalTx;
  }
});

test('commitReservation creates stock movement and updates listing', async () => {
  const originalTx = prisma.$transaction;

  try {
    let movementCreated = false;
    let listingUpdated: any = null;
    let reservationUpdated: any = null;

    const tx = {
      reservation: {
        findUnique: async ({ where }: any) => ({ id: where.id, listingId: 'L200', warehouseId: 'W2', quantity: 3, status: 'ACTIVE' }),
        update: async ({ where, data }: any) => { reservationUpdated = { where, data }; return { id: where.id, ...data }; }
      },
      listing: {
        findUnique: async ({ where }: any) => ({ id: where.id, quantity: 5 }),
        update: async ({ where, data }: any) => { listingUpdated = { where, data }; return { id: where.id, ...data }; }
      },
      stockMovement: {
        create: async ({ data }: any) => { movementCreated = true; return { id: 'mov-r', ...data }; }
      }
    } as any;

    prisma.$transaction = (async (fn: any) => fn(tx)) as any;

    const updated = await ReservationService.commitReservation('res-1');

    assert.equal(movementCreated, true);
    assert.equal(listingUpdated.data.quantity, 2);
    assert.equal(updated.status, 'COMMITTED');
  } finally {
    prisma.$transaction = originalTx;
  }
});

test('commitReservation creates journal entries when accounts exist', async () => {
  const originalTx = prisma.$transaction;

  try {
    const created: any[] = [];

    const tx = {
      reservation: {
        findUnique: async ({ where }: any) => ({ id: where.id, listingId: 'L500', warehouseId: 'W5', quantity: 2, status: 'ACTIVE' }),
        update: async ({ where, data }: any) => ({ id: where.id, ...data })
      },
      listing: {
        findUnique: async ({ where }: any) => ({ id: where.id, quantity: 10, finalPrice: 2000, costPrice: 1200, storeId: 'S1' }),
        update: async ({ where, data }: any) => ({ id: where.id, ...data })
      },
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

    const updated = await ReservationService.commitReservation('res-je');

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

test('commitReservation fails on insufficient stock', async () => {
  const originalTx = prisma.$transaction;

  try {
    const tx = {
      reservation: { findUnique: async ({ where }: any) => ({ id: where.id, listingId: 'L300', warehouseId: 'W3', quantity: 8, status: 'ACTIVE' }) },
      listing: { findUnique: async ({ where }: any) => ({ id: where.id, quantity: 5 }) }
    } as any;

    prisma.$transaction = (async (fn: any) => fn(tx)) as any;

    await assert.rejects(async () => {
      await ReservationService.commitReservation('res-2');
    }, /Insufficient stock/);
  } finally {
    prisma.$transaction = originalTx;
  }
});
