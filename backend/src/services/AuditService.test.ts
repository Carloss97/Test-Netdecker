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
