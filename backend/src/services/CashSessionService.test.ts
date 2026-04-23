import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import CashSessionService from './CashSessionService.js';

test('openSession creates a session', async () => {
  const orig = (prisma as any).cashSession;
  try {
    let created: any = null;
    (prisma as any).cashSession = { create: async ({ data }: any) => { created = { id: 'cs-1', ...data }; return created; }, findUnique: async () => null };

    const s = await CashSessionService.openSession({ storeId: 'S1', openedBy: 'user1', startingCash: 100 });
    assert.equal(s.id, 'cs-1');
    assert.equal(s.startingCash, 100);
  } finally {
    (prisma as any).cashSession = orig;
  }
});

test('closeSession updates session', async () => {
  const orig = (prisma as any).cashSession;
  try {
    (prisma as any).cashSession = {
      findUnique: async () => ({ id: 'cs-1', sessionId: 'cs-1' }),
      update: async ({ where, data }: any) => ({ id: where.sessionId, ...data })
    };

    const updated = await CashSessionService.closeSession('cs-1', { closedBy: 'user2', endingCash: 200 });
    assert.equal(updated.closedBy, 'user2');
    assert.equal(updated.endingCash, 200);
  } finally {
    (prisma as any).cashSession = orig;
  }
});

test('closeSession calculates theoretical cash and creates discrepancy log when counts differ', async () => {
  const originalCashSession = (prisma as any).cashSession;
  const originalPOSSession = (prisma as any).pOSSession;
  const originalPaymentTransaction = (prisma as any).paymentTransaction;
  const originalCashDiscrepancyLog = (prisma as any).cashDiscrepancyLog;

  try {
    let updatedPayload: any = null;
    let discrepancyCreated: any = null;

    (prisma as any).cashSession = {
      findUnique: async () => ({ id: 'cash-1', sessionId: 'cash-1', storeId: 'store-1', openedBy: 'operator-1', startingCash: 100, createdAt: new Date('2026-04-23T08:00:00.000Z') }),
      update: async ({ data }: any) => {
        updatedPayload = data;
        return { id: 'cash-1', sessionId: 'cash-1', ...data };
      },
    };

    (prisma as any).pOSSession = {
      findMany: async () => [{ id: 'pos-1' }, { id: 'pos-2' }],
    };

    (prisma as any).paymentTransaction = {
      findMany: async () => [
        { amount: 500, method: 'CASH' },
        { amount: 250, method: 'CARD' },
        { amount: 150, method: 'CASH' },
      ],
    };

    (prisma as any).cashDiscrepancyLog = {
      create: async ({ data }: any) => {
        discrepancyCreated = data;
        return { id: 'disc-1', ...data };
      },
      findMany: async () => [],
    };

    const updated = await CashSessionService.closeSession('cash-1', { closedBy: 'user2', actualCashAmount: 700 });

    assert.equal(updated.actualCashAmount, 700);
    assert.equal(updated.theoreticalAmount, 750);
    assert.equal(updated.discrepancy, -50);
    assert.equal(updated.status, 'DISCREPANCY');
    assert.equal(updatedPayload.theoreticalAmount, 750);
    assert.equal(updatedPayload.discrepancy, -50);
    assert.equal(updatedPayload.status, 'DISCREPANCY');
    assert.equal(discrepancyCreated.actualCashAmount, 700);
    assert.equal(discrepancyCreated.theoreticalAmount, 750);
    assert.equal(discrepancyCreated.discrepancy, -50);
  } finally {
    (prisma as any).cashSession = originalCashSession;
    (prisma as any).pOSSession = originalPOSSession;
    (prisma as any).paymentTransaction = originalPaymentTransaction;
    (prisma as any).cashDiscrepancyLog = originalCashDiscrepancyLog;
  }
});
