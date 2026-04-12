import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import PaymentService from '../services/PaymentService.js';
import { handleStripeWebhookEvent } from './payments.routes.js';

test('handleStripeWebhookEvent skips when order already exists', async () => {
  const originalFindFirst = prisma.order.findFirst;
  const originalProcess = PaymentService.processPosSale;

  try {
    prisma.order.findFirst = async () => ({ id: 'ord-existing' }) as any;
    let called = false;
    PaymentService.processPosSale = async () => { called = true; } as any;

    const event = {
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_abc', metadata: { items: JSON.stringify([{ listingId: 'L1', quantity: 1 }]) } } }
    } as any;

    const res = await handleStripeWebhookEvent(event);
    assert.equal(res.note, 'Already processed');
    assert.equal(called, false);
  } finally {
    prisma.order.findFirst = originalFindFirst;
    PaymentService.processPosSale = originalProcess;
  }
});

test('handleStripeWebhookEvent processes sale when not existing', async () => {
  const originalFindFirst = prisma.order.findFirst;
  const originalProcess = PaymentService.processPosSale;

  try {
    prisma.order.findFirst = async () => null as any;
    let calledWith: any = null;
    PaymentService.processPosSale = async (input: any) => { calledWith = input; return {}; } as any;

    const event = {
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_xyz', metadata: { items: JSON.stringify([{ listingId: 'L2', quantity: 2 }]), storeId: 'S1' } } }
    } as any;

    const res = await handleStripeWebhookEvent(event);
    assert.equal((res as any).received, true);
    assert.ok(calledWith, 'processPosSale should be called');
    assert.equal(calledWith.externalReference, 'stripe_intent:pi_xyz');
    assert.deepEqual(calledWith.items, [{ listingId: 'L2', quantity: 2 }]);
    assert.equal(calledWith.storeId, 'S1');
  } finally {
    prisma.order.findFirst = originalFindFirst;
    PaymentService.processPosSale = originalProcess;
  }
});
