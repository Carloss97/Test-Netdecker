import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';

test('create and read fiscal period via Prisma', async () => {
  const store = await prisma.store.create({ data: { slug: `test-store-${Date.now()}`, name: 'Test Store' } });

  const start = new Date();
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const fp = await prisma.fiscalPeriod.create({ data: { storeId: store.id, startDate: start, endDate: end, status: 'OPEN' } });

  const fetched = await prisma.fiscalPeriod.findUnique({ where: { id: fp.id } });
  assert.ok(fetched);
  assert.equal(fetched?.storeId, store.id);
  assert.equal(fetched?.status, 'OPEN');

  await prisma.fiscalPeriod.delete({ where: { id: fp.id } });
  await prisma.store.delete({ where: { id: store.id } });
});
