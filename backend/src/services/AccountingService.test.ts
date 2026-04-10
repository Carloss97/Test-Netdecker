import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import { AccountingService } from './AccountingService.js';

test('createJournalEntry succeeds when balanced', async () => {
  const originalTx = prisma.$transaction;

  try {
    const tx = {
      journalEntry: {
        create: async ({ data }: any) => ({ id: 'je-1', ...data })
      },
      journalLine: {
        create: async ({ data }: any) => ({ id: 'jl-1', ...data })
      }
    } as any;

    prisma.$transaction = (async (fn: any) => fn(tx)) as any;

    const je: any = await AccountingService.createJournalEntry({
      storeId: 'S1',
      description: 'Test entry',
      lines: [
        { accountId: 'A1', debit: 150, credit: 0 },
        { accountId: 'A2', debit: 0, credit: 150 },
      ]
    } as any);

    assert.equal(je.id, 'je-1');
    assert.equal(je.totalDebit, 150);
    assert.equal(je.totalCredit, 150);
  } finally {
    prisma.$transaction = originalTx;
  }
});

test('createJournalEntry rejects when not balanced', async () => {
  await assert.rejects(async () => {
    await AccountingService.createJournalEntry({
      lines: [
        { accountId: 'A1', debit: 100, credit: 0 },
        { accountId: 'A2', debit: 0, credit: 50 }
      ]
    } as any);
  }, /not balanced/);
});
