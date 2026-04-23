import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import ApiKeyService from './ApiKeyService.js';

test('ApiKeyService hash and verify roundtrip', () => {
  const secret = 'super-secret-key';
  const hash = ApiKeyService.hashApiKey(secret);

  assert.equal(ApiKeyService.verifyApiKeyAgainstHash(secret, hash), true);
  assert.equal(ApiKeyService.verifyApiKeyAgainstHash('wrong-secret', hash), false);
});

test('ApiKeyService rotateApiKeyById updates hash and logs rotation', async () => {
  const originalFindUnique = prisma.apiKey.findUnique;
  const originalUpdate = prisma.apiKey.update;
  const originalCreate = prisma.apiKeyRotationLog.create;

  const current = {
    id: 'key-1',
    name: 'IMPORT_API_KEY',
    keyType: 'IMPORT',
    keyHash: ApiKeyService.hashApiKey('old-secret'),
    isActive: true,
  };
  const rotationLogs: any[] = [];

  try {
    prisma.apiKey.findUnique = async () => current as any;
    prisma.apiKey.update = (async ({ data }: any) => {
      Object.assign(current, data);
      return current;
    }) as any;
    prisma.apiKeyRotationLog.create = (async ({ data }: any) => {
      rotationLogs.push(data);
      return data;
    }) as any;

    const rotated = await ApiKeyService.rotateApiKeyById('key-1', { rotatedBy: 'admin-1', reason: 'manual-rotation' });

    assert.equal(rotated.id, 'key-1');
    assert.equal(rotated.keyType, 'IMPORT');
    assert.equal(rotated.name, 'IMPORT_API_KEY');
    assert.ok(rotated.apiKey.length > 10);
    assert.equal(ApiKeyService.verifyApiKeyAgainstHash(rotated.apiKey, current.keyHash), true);
    assert.equal(rotationLogs.length, 1);
    assert.equal(rotationLogs[0].apiKeyId, 'key-1');
    assert.equal(rotationLogs[0].reason, 'manual-rotation');
    assert.equal(rotationLogs[0].rotatedBy, 'admin-1');
  } finally {
    prisma.apiKey.findUnique = originalFindUnique;
    prisma.apiKey.update = originalUpdate;
    prisma.apiKeyRotationLog.create = originalCreate;
  }
});

test('ApiKeyService rotateExpiredKeys only rotates expired keys', async () => {
  const originalFindMany = prisma.apiKey.findMany;
  const originalRotate = ApiKeyService.rotateApiKeyById;

  const expired = {
    id: 'key-expired',
    name: 'IMPORT_API_KEY',
    keyType: 'IMPORT',
    keyHash: ApiKeyService.hashApiKey('expired-secret'),
    isActive: true,
    expiresAt: new Date(Date.now() - 1000),
  };
  const active = {
    id: 'key-active',
    name: 'PRICE_SYNC_KEY',
    keyType: 'PRICE_SYNC',
    keyHash: ApiKeyService.hashApiKey('active-secret'),
    isActive: true,
    expiresAt: new Date(Date.now() + 86400000),
  };

  const rotatedIds: string[] = [];

  try {
    prisma.apiKey.findMany = async () => [expired, active] as any;
    ApiKeyService.rotateApiKeyById = (async (id: string) => {
      rotatedIds.push(id);
      return { id, name: 'IMPORT_API_KEY', keyType: 'IMPORT', apiKey: 'rotated-secret' };
    }) as any;

    const rotated = await ApiKeyService.rotateExpiredKeys();
    assert.equal(rotated.length, 1);
    assert.deepEqual(rotatedIds, ['key-expired']);
  } finally {
    prisma.apiKey.findMany = originalFindMany;
    ApiKeyService.rotateApiKeyById = originalRotate;
  }
});
