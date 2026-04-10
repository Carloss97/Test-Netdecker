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
