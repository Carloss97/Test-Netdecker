import test from 'node:test';
import assert from 'node:assert/strict';
import { requirePermission } from './requirePermission.js';
import PermissionService from '../services/PermissionService.js';

test('requirePermission allows ADMIN', async () => {
  const mw = requirePermission('view', 'dashboard');
  const req: any = { path: '/api/admin/dashboard', adminUser: { id: 'u1', role: 'ADMIN' } };

  let nextCalled = false;
  await mw(req as any, {} as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test('requirePermission denies STAFF without permission', async () => {
  const originalCheck = PermissionService.checkPermission;
  try {
    PermissionService.checkPermission = (async () => false) as any;

    const mw = requirePermission('delete', 'account');
    const req: any = { path: '/api/admin/accounts/1', adminUser: { id: 'u2', role: 'STAFF' } };

    let threw = false;
    try {
      await mw(req as any, {} as any, () => undefined);
    } catch (err: any) {
      threw = true;
      assert.ok(String(err.message).toLowerCase().includes('insufficient permissions'));
    }

    assert.equal(threw, true);
  } finally {
    PermissionService.checkPermission = originalCheck;
  }
});

test('requirePermission allows when permission exists', async () => {
  const originalCheck = PermissionService.checkPermission;
  try {
    PermissionService.checkPermission = (async () => true) as any;

    const mw = requirePermission('approve', 'price');
    const req: any = { path: '/api/admin/approvals/1/approve', adminUser: { id: 'u3', role: 'MANAGER' } };

    let nextCalled = false;
    await mw(req as any, {} as any, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
  } finally {
    PermissionService.checkPermission = originalCheck;
  }
});
