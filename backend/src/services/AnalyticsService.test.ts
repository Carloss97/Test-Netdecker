import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import AnalyticsService from './AnalyticsService.js';

test('AnalyticsService returns zero expenses when expense delegate is unavailable locally', async () => {
  const originalOrderFindMany = prisma.order.findMany;
  const originalExpense = (prisma as any).expense;

  try {
    prisma.order.findMany = (async () => []) as any;
    (prisma as any).expense = undefined;

    const summary = await AnalyticsService.getSalesSummary('local-store-id');

    assert.deepEqual(summary, {
      totalRevenue: 0,
      totalExpenses: 0,
      grossProfit: 0,
      orderCount: 0,
      profitMargin: 0,
    });
  } finally {
    prisma.order.findMany = originalOrderFindMany;
    (prisma as any).expense = originalExpense;
  }
});
