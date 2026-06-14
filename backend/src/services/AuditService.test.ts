import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import AuditService from './AuditService.js';

test('logAction writes audit trail entry', async () => {
  const originalCreate = prisma.auditTrail.create;

  try {
    let created: any = null;
    prisma.auditTrail.create = (async (args: any) => { created = args; return { id: 'a1', ...args.data }; }) as any;

    await AuditService.logAction({ userId: 'u1', action: 'TEST.ACTION', entity: 'Listing', entityId: 'L1', data: { foo: 'bar' }, ip: '1.2.3.4', userAgent: 'ua' });

    assert.ok(created, 'audit create called');
    assert.equal(created.data.userId, 'u1');
    assert.equal(created.data.action, 'TEST.ACTION');
    assert.equal(created.data.entity, 'Listing');
    assert.equal(created.data.entityId, 'L1');
    assert.equal(created.data.ip, '1.2.3.4');
  } finally {
    prisma.auditTrail.create = originalCreate;
  }
});

test('logAction suppresses local schema incompatibility errors', async () => {
  const originalCreate = prisma.auditTrail.create;
  const originalConsoleError = console.error;

  try {
    const errors: unknown[][] = [];
    prisma.auditTrail.create = (async () => {
      throw new Error('Unknown argument `userId`. Did you mean `user`?');
    }) as any;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };

    await AuditService.logAction({ userId: 'dev-admin', action: 'GET /dashboard', entity: null, entityId: null });

    assert.equal(errors.length, 0);
  } finally {
    prisma.auditTrail.create = originalCreate;
    console.error = originalConsoleError;
  }
});

test('computeDiff returns changed keys', () => {
  const diff = AuditService.computeDiff(
    { price: 100, quantity: 2, unchanged: 'x' },
    { price: 120, quantity: 2, unchanged: 'x', status: 'manual' },
  );

  assert.deepEqual(diff, {
    price: { from: 100, to: 120 },
    status: { from: undefined, to: 'manual' },
  });
});

test('auditEntityChange writes structured audit payload', async () => {
  const originalCreate = prisma.auditTrail.create;

  try {
    let created: any = null;
    prisma.auditTrail.create = (async (args: any) => {
      created = args;
      return { id: 'a2', ...args.data };
    }) as any;

    await AuditService.auditEntityChange({
      entityType: 'listing',
      entityId: 'L1',
      oldValue: { quantity: 1 },
      newValue: { quantity: 0 },
      changedBy: 'u1',
      action: 'LISTING.QUANTITY.UPDATE',
    });

    assert.ok(created, 'audit create called');
    assert.equal(created.data.entityType, 'listing');
    assert.equal(created.data.entityId, 'L1');
    assert.equal(created.data.operation, 'UPDATE');
    assert.deepEqual(created.data.diff, {
      quantity: { from: 1, to: 0 },
    });
  } finally {
    prisma.auditTrail.create = originalCreate;
  }
});
