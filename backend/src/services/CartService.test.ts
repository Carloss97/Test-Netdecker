import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import { CartService } from './CartService.js';
import { ListingService } from './ListingService.js';

test('addToCart creates order item when stock available', async () => {
  const originalGetListing = ListingService.getListing;
  const originalGetOrCreateCart = CartService.getOrCreateCart;
  const originalOrderItemFindFirst = prisma.orderItem.findFirst;
  const originalOrderItemCreate = prisma.orderItem.create;
  const originalListingFindUnique = prisma.listing.findUnique;
  const originalOrderItemAggregate = prisma.orderItem.aggregate;

  try {
    let createCalled = false;
    let createdData: any = null;

    ListingService.getListing = (async (id: string) => ({ id, finalPrice: 100, quantity: 5 })) as any;
    CartService.getOrCreateCart = (async (sessionId: string, storeId: string) => ({ id: 'c1', sessionId, storeId, items: [] })) as any;
    prisma.listing.findUnique = (async () => ({ quantity: 5 })) as any;
    prisma.orderItem.aggregate = (async () => ({ _sum: { quantity: 0 } })) as any;
    prisma.orderItem.findFirst = (async () => null) as any;
    prisma.orderItem.create = (async (args: any) => { createCalled = true; createdData = args.data; return { id: 'oi1', ...args.data }; }) as any;

    await CartService.addToCart({ storeId: 'S1', sessionId: 'sess1', listingId: 'L1', quantity: 2 });

    assert.equal(createCalled, true);
    assert.equal(createdData.listingId, 'L1');
    assert.equal(createdData.quantity, 2);
    assert.equal(createdData.cartId, 'c1');
    assert.equal(createdData.subtotal, 200);
    assert.equal(createdData.pricePerUnit, 100);
  } finally {
    ListingService.getListing = originalGetListing;
    CartService.getOrCreateCart = originalGetOrCreateCart;
    prisma.orderItem.findFirst = originalOrderItemFindFirst;
    prisma.orderItem.create = originalOrderItemCreate;
    prisma.listing.findUnique = originalListingFindUnique;
    prisma.orderItem.aggregate = originalOrderItemAggregate;
  }
});

test('addToCart throws when insufficient stock', async () => {
  const originalGetListing = ListingService.getListing;
  const originalGetOrCreateCart = CartService.getOrCreateCart;
  const originalListingFindUnique = prisma.listing.findUnique;
  const originalOrderItemAggregate = prisma.orderItem.aggregate;
  const originalOrderItemFindFirst = prisma.orderItem.findFirst;

  try {
    ListingService.getListing = (async (id: string) => ({ id, finalPrice: 100, quantity: 1 })) as any;
    CartService.getOrCreateCart = (async (sessionId: string, storeId: string) => ({ id: 'c1', sessionId, storeId, items: [] })) as any;
    prisma.listing.findUnique = (async () => ({ quantity: 1 })) as any;
    prisma.orderItem.aggregate = (async () => ({ _sum: { quantity: 0 } })) as any;
    prisma.orderItem.findFirst = (async () => null) as any;

    let threw = false;
    try {
      await CartService.addToCart({ storeId: 'S1', sessionId: 'sess1', listingId: 'L1', quantity: 2 });
    } catch (err: any) {
      threw = true;
      assert.ok(String(err.message).includes('Insufficient stock'));
    }
    assert.equal(threw, true);
  } finally {
    ListingService.getListing = originalGetListing;
    CartService.getOrCreateCart = originalGetOrCreateCart;
    prisma.listing.findUnique = originalListingFindUnique;
    prisma.orderItem.aggregate = originalOrderItemAggregate;
    prisma.orderItem.findFirst = originalOrderItemFindFirst;
  }
});

test('getOrCreateCart exposes ttlSeconds and expiresAt', async () => {
  const originalFindFirst = prisma.cart.findFirst;

  try {
    const updatedAt = new Date(Date.now() - 30 * 1000); // updated 30s ago
    prisma.cart.findFirst = (async () => ({ id: 'c1', sessionId: 's1', items: [], updatedAt })) as any;

    process.env.CART_EXPIRY_MINUTES = '1';
    const cart: any = await CartService.getOrCreateCart('s1', 'S1');

    assert.equal(typeof cart.ttlSeconds, 'number');
    assert.ok(cart.ttlSeconds <= 60 && cart.ttlSeconds >= 0);
    assert.ok(cart.expiresAt);
  } finally {
    prisma.cart.findFirst = originalFindFirst;
    delete process.env.CART_EXPIRY_MINUTES;
  }
});

test('updateItemQuantity throws conflict when cart item version changed', async () => {
  const originalGetOrCreateCart = CartService.getOrCreateCart;
  const originalFindFirst = prisma.orderItem.findFirst;
  const originalAggregate = prisma.orderItem.aggregate;
  const originalListingFindUnique = prisma.listing.findUnique;
  const originalUpdateMany = prisma.orderItem.updateMany;

  try {
    CartService.getOrCreateCart = (async () => ({ id: 'c1', sessionId: 'sess1', items: [] })) as any;
    prisma.orderItem.findFirst = (async () => ({
      id: 'oi1',
      cartId: 'c1',
      listingId: 'L1',
      quantity: 1,
      version: 3,
      listing: { finalPrice: 100 },
    })) as any;
    prisma.orderItem.aggregate = (async () => ({ _sum: { quantity: 0 } })) as any;
    prisma.listing.findUnique = (async () => ({ quantity: 5 })) as any;
    prisma.orderItem.updateMany = (async () => ({ count: 0 })) as any;

    await assert.rejects(async () => {
      await CartService.updateItemQuantity('sess1', 'oi1', 2, 'S1');
    }, /modified by another request/i);
  } finally {
    CartService.getOrCreateCart = originalGetOrCreateCart;
    prisma.orderItem.findFirst = originalFindFirst;
    prisma.orderItem.aggregate = originalAggregate;
    prisma.listing.findUnique = originalListingFindUnique;
    prisma.orderItem.updateMany = originalUpdateMany;
  }
});
