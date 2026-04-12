import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

import { handleStripeWebhookEvent } from './payments.routes.js';
import prisma from '../utils/db.js';
import PaymentService from '../services/PaymentService.js';

describe('Stripe webhook handler', () => {
  test('ignores non payment_intent.succeeded events', async () => {
    const res = await handleStripeWebhookEvent({ type: 'charge.succeeded' });
    assert.deepEqual(res, { received: true });
  });

  test('missing items metadata is ignored', async () => {
    const event = { type: 'payment_intent.succeeded', data: { object: { id: 'pi_missing', metadata: {} } } };
    const res = await handleStripeWebhookEvent(event as any);
    assert.deepEqual(res, { received: true });
  });

  test('invalid items metadata returns error', async () => {
    const event = { type: 'payment_intent.succeeded', data: { object: { id: 'pi_bad', metadata: { items: 'not-json' } } } };
    const res = await handleStripeWebhookEvent(event as any);
    assert.equal((res as any).success, false);
    assert.match(((res as any).message || ''), /Invalid items metadata/);
  });

  test('idempotency: returns early when order exists', async () => {
    // Backup
    const origFindFirst = prisma.order?.findFirst;
    prisma.order = prisma.order || {};
    prisma.order.findFirst = async () => ({ id: 'existing-order' });

    const itemsJson = JSON.stringify([{ listingId: 'L1', quantity: 1 }]);
    const event = { type: 'payment_intent.succeeded', data: { object: { id: 'pi_1', metadata: { items: itemsJson } } } };
    const res = await handleStripeWebhookEvent(event as any);
    assert.equal((res as any).received, true);
    assert.equal((res as any).note, 'Already processed');

    // Restore
    if (origFindFirst) prisma.order.findFirst = origFindFirst;
  });

  test('processes sale when no existing order and calls PaymentService', async () => {
    // Backup
    const origFindFirst = prisma.order?.findFirst;
    const origProcess = PaymentService.processPosSale;
    prisma.order = prisma.order || {};
    prisma.order.findFirst = async () => null;

    let calledWith: any = null;
    PaymentService.processPosSale = async (args: any) => {
      calledWith = args;
      return { id: 'created-order' };
    };

    const items = [{ listingId: 'L1', quantity: 2 }];
    const itemsJson = JSON.stringify(items);
    const event = { type: 'payment_intent.succeeded', data: { object: { id: 'pi_abc', metadata: { items: itemsJson, storeId: 'store_1' } } } };

    const res = await handleStripeWebhookEvent(event as any);
    assert.equal((res as any).received, true);
    assert.ok(calledWith, 'processPosSale should have been called');
    assert.deepEqual(calledWith.items, items);
    assert.equal(calledWith.storeId, 'store_1');
    assert.equal(calledWith.paymentMethod, 'CARD');
    assert.equal(calledWith.externalReference, 'stripe_intent:pi_abc');

    // Restore
    PaymentService.processPosSale = origProcess;
    if (origFindFirst) prisma.order.findFirst = origFindFirst;
  });
});
