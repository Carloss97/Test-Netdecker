import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import PriceApprovalService from './PriceApprovalService.js';
import { PriceService } from './PriceService.js';

test('createApproval stores approval record', async () => {
  const origCreate = prisma.priceChangeApproval.create;
  try {
    let called = 0;
    prisma.priceChangeApproval.create = (async (args: any) => { called++; return { id: 'a1', ...args.data }; }) as any;

    const res = await PriceApprovalService.createApproval({ newFinalPrice: 100, newReferencePrice: 1, marginMultiplier: 1.2, percentChange: 50 });
    assert.equal(called, 1);
    assert.equal((res as any).newFinalPrice, 100);
  } finally {
    prisma.priceChangeApproval.create = origCreate;
  }
});

test('approve applies price change and marks APPROVED', async () => {
  const origFindUnique = prisma.priceChangeApproval.findUnique;
  const origUpdate = prisma.priceChangeApproval.update;
  const origUpdateListing = PriceService.updateListingPrice;

  try {
    prisma.priceChangeApproval.findUnique = (async () => ({ id: 'a2', listingId: 'L1', status: 'PENDING', newReferencePrice: 2, marginMultiplier: 1.2 })) as any;
    let updated = 0;
    prisma.priceChangeApproval.update = (async (args: any) => { updated++; return { id: args.where.id, status: 'APPROVED' }; }) as any;
    PriceService.updateListingPrice = (async () => { return; }) as any;

    const res = await PriceApprovalService.approve('a2', 'tester');
    assert.equal(updated, 1);
    assert.equal((res as any).status, 'APPROVED');
  } finally {
    prisma.priceChangeApproval.findUnique = origFindUnique;
    prisma.priceChangeApproval.update = origUpdate;
    PriceService.updateListingPrice = origUpdateListing;
  }
});

test('reject marks REJECTED', async () => {
  const origFindUnique = prisma.priceChangeApproval.findUnique;
  const origUpdate = prisma.priceChangeApproval.update;

  try {
    prisma.priceChangeApproval.findUnique = (async () => ({ id: 'a3', listingId: 'L2', status: 'PENDING' })) as any;
    let updated = 0;
    prisma.priceChangeApproval.update = (async (args: any) => { updated++; return { id: args.where.id, status: 'REJECTED' }; }) as any;

    const res = await PriceApprovalService.reject('a3', 'tester', 'not ok');
    assert.equal(updated, 1);
    assert.equal((res as any).status, 'REJECTED');
  } finally {
    prisma.priceChangeApproval.findUnique = origFindUnique;
    prisma.priceChangeApproval.update = origUpdate;
  }
});
import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import PriceApprovalService from './PriceApprovalService.js';
import { PriceService } from './PriceService.js';

test('createApproval stores approval record', async () => {
  const origCreate = prisma.priceChangeApproval.create;
  try {
    let called = false;
    prisma.priceChangeApproval.create = (async (args: any) => {
      called = true;
      return { id: 'pa1', ...args.data };
    }) as any;

    const rec = await PriceApprovalService.createApproval({
      listingId: 'L1',
      oldFinalPrice: 1000,
      newFinalPrice: 1300,
      newReferencePrice: 5,
      marginMultiplier: 1.2,
      percentChange: 30,
      requestedBy: 'sync',
    });

    assert.equal(called, true);
    assert.equal(rec.id, 'pa1');
    assert.equal(rec.listingId, 'L1');
  } finally {
    prisma.priceChangeApproval.create = origCreate;
  }
});

test('approve applies update and marks approval approved', async () => {
  const origFindUnique = prisma.priceChangeApproval.findUnique;
  const origUpdate = prisma.priceChangeApproval.update;
  const origUpdateListing = PriceService.updateListingPrice;

  try {
    prisma.priceChangeApproval.findUnique = (async () => ({
      id: 'pa1', listingId: 'L1', newReferencePrice: 5, marginMultiplier: 1.2, status: 'PENDING'
    })) as any;

    let updatedCalled = false;
    PriceService.updateListingPrice = (async () => { updatedCalled = true; }) as any;

    prisma.priceChangeApproval.update = (async (args: any) => ({ id: args.where.id, status: args.data.status })) as any;

    const updated = await PriceApprovalService.approve('pa1', 'admin');
    assert.equal(updatedCalled, true);
    assert.equal(updated.status, 'APPROVED');
  } finally {
    prisma.priceChangeApproval.findUnique = origFindUnique;
    prisma.priceChangeApproval.update = origUpdate;
    PriceService.updateListingPrice = origUpdateListing;
  }
});
