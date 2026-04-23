import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import AdminAuthService from './AdminAuthService.js';
import crypto from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(crypto.scrypt);

test('createUser stores hashed password and returns user info', async () => {
  const originalFindUnique = prisma.adminUser.findUnique;
  const originalCreate = prisma.adminUser.create;

  try {
    prisma.adminUser.findUnique = (async () => null) as any;
    let createdArgs: any = null;
    prisma.adminUser.create = (async (_args: any) => { createdArgs = _args; return { id: 'u1', email: _args.data.email, role: _args.data.role }; }) as any;

    const res = await AdminAuthService.createUser('admin@example.com', 's3cret', 'STAFF');
    assert.equal(res.email, 'admin@example.com');
    assert.equal(res.role, 'STAFF');
    assert.ok(createdArgs, 'prisma.create should be called');
    assert.ok(createdArgs.data.passwordHash, 'passwordHash saved');
    assert.ok(createdArgs.data.passwordSalt, 'passwordSalt saved');
  } finally {
    prisma.adminUser.findUnique = originalFindUnique;
    prisma.adminUser.create = originalCreate;
  }
});

test('createUser accepts MANAGER role', async () => {
  const originalFindUnique = prisma.adminUser.findUnique;
  const originalCreate = prisma.adminUser.create;

  try {
    prisma.adminUser.findUnique = (async () => null) as any;
    prisma.adminUser.create = (async (_args: any) => ({ id: 'u2', email: _args.data.email, role: _args.data.role })) as any;

    const res = await AdminAuthService.createUser('manager@example.com', 's3cret', 'MANAGER');
    assert.equal(res.email, 'manager@example.com');
    assert.equal(res.role, 'MANAGER');
  } finally {
    prisma.adminUser.findUnique = originalFindUnique;
    prisma.adminUser.create = originalCreate;
  }
});

test('authenticate creates session and validateToken works; logout deletes session', async () => {
  const originalFindUniqueUser = prisma.adminUser.findUnique;
  const originalSessionCreate = prisma.adminSession.create;
  const originalSessionFind = prisma.adminSession.findUnique;
  const originalSessionDelete = prisma.adminSession.deleteMany;
  const originalUserUpdate = prisma.adminUser.update;

  try {
    // prepare password hash using same algorithm
    const password = 'my-password-1';
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = (await scryptAsync(password, salt, 64)) as Buffer;
    const hash = derived.toString('hex');

    prisma.adminUser.findUnique = (async () => ({ id: 'u1', email: 'admin@example.com', passwordSalt: salt, passwordHash: hash, role: 'ADMIN', isActive: true })) as any;

    let createdSessionArgs: any = null;
    prisma.adminSession.create = (async (_args: any) => { createdSessionArgs = _args; return { id: 's1', token: _args.data.token, userId: _args.data.userId, expiresAt: _args.data.expiresAt }; }) as any;
    prisma.adminUser.update = (async (_args: any) => ({ id: 'u1', ..._args.data })) as any;

    const auth = await AdminAuthService.authenticate('admin@example.com', password);
    assert.ok(auth.token, 'token returned');
    assert.equal(auth.user.email, 'admin@example.com');
    assert.ok(createdSessionArgs, 'session created');

    prisma.adminSession.findUnique = (async () => ({ token: createdSessionArgs.data.token, expiresAt: createdSessionArgs.data.expiresAt, user: { id: 'u1', email: 'admin@example.com', role: 'ADMIN', isActive: true } })) as any;

    const validated = await AdminAuthService.validateToken(createdSessionArgs.data.token);
    assert.equal(validated?.email, 'admin@example.com');

    let deleteCalled = false;
    prisma.adminSession.deleteMany = (async (_args: any) => { deleteCalled = true; return { count: 1 }; }) as any;

    await AdminAuthService.logout(createdSessionArgs.data.token);
    assert.equal(deleteCalled, true);
  } finally {
    prisma.adminUser.findUnique = originalFindUniqueUser;
    prisma.adminSession.create = originalSessionCreate;
    prisma.adminUser.update = originalUserUpdate;
    prisma.adminSession.findUnique = originalSessionFind;
    prisma.adminSession.deleteMany = originalSessionDelete;
  }
});
