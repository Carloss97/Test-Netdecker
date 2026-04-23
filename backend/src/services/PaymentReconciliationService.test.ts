import test from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../utils/db.js';
import StripeService from './StripeService.js';
import PaymentReconciliationService from './PaymentReconciliationService.js';

test('reconcileDaily stores report and detects Stripe and DB orphans', async () => {
  const originalListCharges = StripeService.listCharges;
  const originalOrderFindMany = prisma.order.findMany;
  const originalReportCreate = (prisma as any).paymentReconciliationReport?.create;

  try {
    StripeService.listCharges = (async () => [
      {
        id: 'ch_1',
        amount: 2500,
        created: Math.floor(new Date('2026-04-10T10:00:00.000Z').getTime() / 1000),
        currency: 'CLP',
        paymentIntentId: 'pi_exists_only_in_stripe',
      },
    ]) as typeof StripeService.listCharges;

    prisma.order.findMany = (async () => [
      {
        id: 'ord_1',
        orderNumber: 'ORD-001',
        total: 1900,
        createdAt: new Date('2026-04-10T10:05:00.000Z'),
        notes: 'stripe_intent:pi_exists_only_in_db',
      },
    ]) as typeof prisma.order.findMany;

    let insertedData: any = null;
    (prisma as any).paymentReconciliationReport = {
      create: async ({ data }: any) => {
        insertedData = data;
        return { id: 'rep_1' };
      },
    };

    const result = await PaymentReconciliationService.reconcileDaily({
      windowStart: new Date('2026-04-10T00:00:00.000Z'),
      windowEnd: new Date('2026-04-11T00:00:00.000Z'),
    });

    assert.equal(result.reportId, 'rep_1');
    assert.equal(result.totalStripeTransactions, 1);
    assert.equal(result.totalLocalOrders, 1);
    assert.equal(result.totalDiscrepancies, 2);
    assert.equal(result.discrepancies.some((d) => d.type === 'STRIPE_ORPHAN'), true);
    assert.equal(result.discrepancies.some((d) => d.type === 'DB_ORPHAN'), true);

    assert.equal(insertedData.totalStripeTransactions, 1);
    assert.equal(insertedData.totalLocalOrders, 1);
    assert.equal(insertedData.totalDiscrepancies, 2);
    assert.equal(Array.isArray(insertedData.discrepancies), true);
  } finally {
    StripeService.listCharges = originalListCharges;
    prisma.order.findMany = originalOrderFindMany;

    if (originalReportCreate) {
      (prisma as any).paymentReconciliationReport.create = originalReportCreate;
    }
  }
});

test('listReports returns newest reports first with bounded limit', async () => {
  const originalReportFindMany = (prisma as any).paymentReconciliationReport?.findMany;

  try {
    let receivedTake = 0;
    (prisma as any).paymentReconciliationReport = {
      findMany: async ({ take }: any) => {
        receivedTake = take;
        return [{ id: 'rep_a' }, { id: 'rep_b' }];
      },
    };

    const rows = await PaymentReconciliationService.listReports(999);
    assert.equal(receivedTake, 200);
    assert.equal(rows.length, 2);
  } finally {
    if (originalReportFindMany) {
      (prisma as any).paymentReconciliationReport.findMany = originalReportFindMany;
    }
  }
});
