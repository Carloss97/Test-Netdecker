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
