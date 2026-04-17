import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import { runReservationCleanup } from './reservationCleanup.job.js';

test('runReservationCleanup marks expired reservations as EXPIRED', async () => {
  const origFindMany = prisma.reservation.findMany;
  const origUpdate = prisma.reservation.update;

  try {
    let updateCalled = 0;
    prisma.reservation.findMany = (async () => ([{ id: 'r1', listingId: 'L1', warehouseId: null, quantity: 2 }])) as any;
    prisma.reservation.update = (async (args: any) => { updateCalled++; return { id: args.where.id, status: 'EXPIRED' }; }) as any;

    const res: any = await runReservationCleanup();
    assert.equal(res.processed, 1);
    assert.equal(updateCalled, 1);
  } finally {
    prisma.reservation.findMany = origFindMany;
    prisma.reservation.update = origUpdate;
  }
});

test('runReservationCleanup reverts OUT movements and increases listing qty', async () => {
  const origFindMany = prisma.reservation.findMany;
  const origStockFind = prisma.stockMovement.findMany;
  const origStockCreate = prisma.stockMovement.create;
  const origListingUpdate = prisma.listing.update;
  const origReservationUpdate = prisma.reservation.update;

  try {
    prisma.reservation.findMany = (async () => ([{ id: 'r2', listingId: 'L2', warehouseId: 'W1', quantity: 3 }])) as any;
    prisma.stockMovement.findMany = (async () => ([{ id: 'm1', type: 'OUT', quantity: 3 }])) as any;

    let createdMovements = 0;
    prisma.stockMovement.create = (async () => { createdMovements++; return { id: 'm2' }; }) as any;

    let listingUpdated = 0;
    prisma.listing.update = (async () => { listingUpdated++; return {}; }) as any;

    let reservationUpdated = 0;
    prisma.reservation.update = (async () => { reservationUpdated++; return {}; }) as any;

    const res: any = await runReservationCleanup();
    assert.equal(res.processed, 1);
    assert.equal(createdMovements, 1);
    assert.equal(listingUpdated, 1);
    assert.equal(reservationUpdated, 1);
  } finally {
    prisma.reservation.findMany = origFindMany;
    prisma.stockMovement.findMany = origStockFind;
    prisma.stockMovement.create = origStockCreate;
    prisma.listing.update = origListingUpdate;
    prisma.reservation.update = origReservationUpdate;
  }
});
