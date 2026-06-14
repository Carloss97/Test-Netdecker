import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import PaymentService from './PaymentService.js';
import WebhookQueueService from './WebhookQueueService.js';

test('WebhookQueueService retries failed jobs before DLQ', async () => {
  const originalUpdateMany = prisma.webhookJob.updateMany;
  const originalUpdate = prisma.webhookJob.update;
  const originalCreate = prisma.deadLetterQueue.create;
  const originalFindFirst = prisma.order.findFirst;
  const originalProcess = PaymentService.processPosSale;

  const updates: any[] = [];
  const dlqCreates: any[] = [];

  try {
    prisma.webhookJob.updateMany = async () => ({ count: 1 }) as any;
    prisma.webhookJob.update = (async ({ data }: any) => {
      updates.push(data);
      return data;
    }) as any;
    prisma.deadLetterQueue.create = (async ({ data }: any) => {
      dlqCreates.push(data);
      return data;
    }) as any;
    prisma.order.findFirst = async () => null as any;
    PaymentService.processPosSale = (async () => {
      throw new Error('boom');
    }) as any;

    await WebhookQueueService.processJob({
      id: 'job-1',
      provider: 'STRIPE',
      eventType: 'payment_intent.succeeded',
      payload: {
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_1', metadata: { items: JSON.stringify([{ listingId: 'L1', quantity: 1 }]) } } },
      },
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 5,
    });

    assert.equal(dlqCreates.length, 0);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].status, 'PENDING');
    assert.equal(updates[0].attempts, 1);
    assert.ok(updates[0].nextRetryAt instanceof Date);
  } finally {
    prisma.webhookJob.updateMany = originalUpdateMany;
    prisma.webhookJob.update = originalUpdate;
    prisma.deadLetterQueue.create = originalCreate;
    prisma.order.findFirst = originalFindFirst;
    PaymentService.processPosSale = originalProcess;
  }
});

test('WebhookQueueService moves exhausted jobs to DLQ', async () => {
  const originalUpdateMany = prisma.webhookJob.updateMany;
  const originalUpdate = prisma.webhookJob.update;
  const originalCreate = prisma.deadLetterQueue.create;
  const originalFindFirst = prisma.order.findFirst;
  const originalProcess = PaymentService.processPosSale;

  const updates: any[] = [];
  const dlqCreates: any[] = [];

  try {
    prisma.webhookJob.updateMany = async () => ({ count: 1 }) as any;
    prisma.webhookJob.update = (async ({ data }: any) => {
      updates.push(data);
      return data;
    }) as any;
    prisma.deadLetterQueue.create = (async ({ data }: any) => {
      dlqCreates.push(data);
      return data;
    }) as any;
    prisma.order.findFirst = async () => null as any;
    PaymentService.processPosSale = (async () => {
      throw new Error('boom');
    }) as any;

    await WebhookQueueService.processJob({
      id: 'job-2',
      provider: 'STRIPE',
      eventType: 'payment_intent.succeeded',
      payload: {
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_2', metadata: { items: JSON.stringify([{ listingId: 'L1', quantity: 1 }]) } } },
      },
      status: 'PENDING',
      attempts: 5,
      maxAttempts: 5,
    });

    assert.equal(dlqCreates.length, 1);
    assert.equal(dlqCreates[0].webhookJobId, 'job-2');
    assert.equal(dlqCreates[0].provider, 'STRIPE');
    assert.equal(updates.at(-1).status, 'FAILED');
  } finally {
    prisma.webhookJob.updateMany = originalUpdateMany;
    prisma.webhookJob.update = originalUpdate;
    prisma.deadLetterQueue.create = originalCreate;
    prisma.order.findFirst = originalFindFirst;
    PaymentService.processPosSale = originalProcess;
  }
});
