// Ensure DB init is skipped so we can stub Prisma methods
process.env.SKIP_DB_INIT = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../../index.js';
import { ListingService } from '../../services/ListingService.js';
import { PriceService } from '../../services/PriceService.js';
import { PriceSyncService } from '../../services/PriceSyncService.js';
import { CartService } from '../../services/CartService.js';

test('integration: main endpoints (health, listings, pricing, cart)', async (t) => {
  // Save originals to restore later
  const origListingGet = ListingService.getListing;
  const origListingList = ListingService.listListings;
  const origPriceDetailed = PriceService.calculateFinalPriceDetailed;
  const origPriceSyncRun = PriceSyncService.runPriceSync;
  const origCartGet = CartService.getCart;
  const origCartAdd = CartService.addToCart;
  const origCartCheckout = CartService.checkout;

  try {
    // Stub service methods used by routes
    ListingService.getListing = async (id: string) => ({
      id,
      cardId: 'card1',
      card: { cardName: 'Test Card' },
      referencePrice: 10,
      marginMultiplier: 1,
      finalPrice: 100,
      lastSyncedAt: new Date(),
      exchangeRate: 1000,
      quantity: 5,
    } as any);

    ListingService.listListings = async () => ([{ id: 'L1', finalPrice: 100, quantity: 5 } as any]);

    PriceService.calculateFinalPriceDetailed = async ({ referencePrice, marginMultiplier }: any) => ({
      finalPrice: referencePrice * marginMultiplier * 1000,
      rawFinalPrice: referencePrice * marginMultiplier * 1000,
      exchangeRate: 1000,
      referencePrice,
      roundingMultiple: 1,
      marginMultiplier,
      retrievalSource: 'api',
      formula: `${referencePrice} * ${marginMultiplier} * 1000`,
    } as any);

    PriceSyncService.runPriceSync = async (opts: any) => ({ runId: 'run-1', updated: (opts?.updates?.length) ?? 0, failed: 0 } as any);

    CartService.getCart = async (sessionId: string) => ({ id: 'cart1', sessionId, items: [], ttlSeconds: 3600, expiresAt: new Date(Date.now() + 3600000) } as any);

    CartService.addToCart = async (input: any) => ({ id: 'cart1', sessionId: input.sessionId, items: [{ id: 'item1', listingId: input.listingId, quantity: input.quantity, subtotal: input.quantity * 100 }] } as any);

    CartService.checkout = async (_sessionId: string, _customerEmail: string) => ({ id: 'order1', orderNumber: `ORD-${Date.now()}`, status: 'PENDING', subtotal: 100, total: 100 } as any);

    // Start server on ephemeral port
    const server = app.listen(0);
    const addr = server.address();
    const port = (addr && typeof addr === 'object' && 'port' in addr) ? (addr as any).port : (addr as any);
    const base = `http://127.0.0.1:${port}`;

    await t.test('GET /api/health returns ok', async () => {
      const res = await fetch(`${base}/api/health`);
      assert.equal(res.status, 200);
      const j: any = await res.json();
      assert.equal(j.status, 'ok');
    });

    await t.test('GET /api/listings/:id returns listing', async () => {
      const res = await fetch(`${base}/api/listings/L1`);
      assert.equal(res.status, 200);
      const j: any = await res.json();
      assert.equal(j.id, 'L1');
    });

    await t.test('POST /api/listings/price-preview returns CLP calculation', async () => {
      const res = await fetch(`${base}/api/listings/price-preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ referencePrice: 1, marginMultiplier: 1.2 }) });
      assert.equal(res.status, 200);
      const j: any = await res.json();
      assert.equal(j.currency, 'CLP');
      assert.ok(typeof j.finalPrice === 'number');
    });

    await t.test('POST /api/listings/sync-prices triggers run', async () => {
      const res = await fetch(`${base}/api/listings/sync-prices`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ updates: [{ listingId: 'L1', referencePrice: 12 }] }) });
      assert.equal(res.status, 200);
      const j: any = await res.json();
      assert.equal(j.runId, 'run-1');
      assert.equal(j.updated, 1);
    });

    await t.test('GET /api/cart/:sessionId returns cart', async () => {
      const res = await fetch(`${base}/api/cart/session123`);
      assert.equal(res.status, 200);
      const j: any = await res.json();
      assert.equal(j.sessionId, 'session123');
    });

    await t.test('POST /api/cart/:sessionId/add adds item', async () => {
      const res = await fetch(`${base}/api/cart/session123/add`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ listingId: 'L1', quantity: 2 }) });
      assert.equal(res.status, 200);
      const j: any = await res.json();
      assert.ok(Array.isArray(j.items) && j.items.length === 1);
      assert.equal(j.items[0].listingId, 'L1');
    });

    await t.test('POST /api/cart/:sessionId/checkout returns order', async () => {
      const res = await fetch(`${base}/api/cart/session123/checkout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customerEmail: 'test@example.com' }) });
      assert.equal(res.status, 201);
      const j: any = await res.json();
      assert.ok(typeof j.orderNumber === 'string' && j.orderNumber.startsWith('ORD'));
    });

    server.close();
  } finally {
    // Restore originals
    ListingService.getListing = origListingGet;
    ListingService.listListings = origListingList;
    PriceService.calculateFinalPriceDetailed = origPriceDetailed;
    PriceSyncService.runPriceSync = origPriceSyncRun;
    CartService.getCart = origCartGet;
    CartService.addToCart = origCartAdd;
    CartService.checkout = origCartCheckout;
  }
});
