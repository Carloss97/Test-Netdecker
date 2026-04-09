import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import StoreService from './StoreServiceImpl.js';

test('StoreService.createStore hashes api key and verify works', async () => {
  const slug = `svc-create-${Date.now()}`;
  const name = 'Service Create Test';

  const { store, apiKey } = await StoreService.createStore({ slug, name });
  try {
    assert.ok(apiKey && typeof apiKey === 'string');
    assert.equal(store.slug, slug);
    // Stored hash should verify for returned apiKey
    const fresh = await prisma.store.findUnique({ where: { id: store.id } });
    assert.ok(fresh);
    const ok = StoreService.verifyApiKey(apiKey, fresh!.apiKeyHash);
    assert.ok(ok, 'created api key should verify against stored hash');
  } finally {
    await prisma.store.delete({ where: { id: store.id } });
  }
});

test('StoreService.rotateApiKey replaces key and invalidates previous', async () => {
  const slug = `svc-rotate-${Date.now()}`;
  const name = 'Service Rotate Test';

  const created = await StoreService.createStore({ slug, name });
  try {
    const storeId = created.store.id;
    const oldApiKey = created.apiKey;

    const { apiKey: newApiKey } = await StoreService.rotateApiKey(storeId);
    const refreshed = await prisma.store.findUnique({ where: { id: storeId } });
    assert.ok(refreshed);

    // old should not verify
    assert.equal(StoreService.verifyApiKey(oldApiKey, refreshed!.apiKeyHash), false);
    // new should verify
    assert.equal(StoreService.verifyApiKey(newApiKey, refreshed!.apiKeyHash), true);
  } finally {
    await prisma.store.delete({ where: { id: created.store.id } });
  }
});
import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import StoreService from './StoreService.js';

test('createStore generates an API key and verifyApiKey accepts it', async () => {
  const slug = `svc-create-${Date.now()}`;
  const { store, apiKey } = await StoreService.createStore({ slug, name: 'Service Test Store' });
  try {
    assert.ok(store?.id, 'store created');
    assert.ok(typeof apiKey === 'string' && apiKey.length > 0, 'apiKey returned');

    const resolved = await StoreService.verifyApiKey(apiKey as string);
    assert.ok(resolved, 'verifyApiKey should return a store');
    assert.equal(resolved!.id, store.id);
  } finally {
    await prisma.store.delete({ where: { id: store.id } });
  }
});

test('rotateApiKey invalidates old key and returns new key', async () => {
  const slug = `svc-rotate-${Date.now()}`;
  const { store, apiKey: initial } = await StoreService.createStore({ slug, name: 'Rotate Test' });

  try {
    const v1 = await StoreService.verifyApiKey(initial as string);
    assert.ok(v1 && v1.id === store.id);

    const { apiKey: rotated } = await StoreService.rotateApiKey(store.id);
    assert.ok(typeof rotated === 'string' && rotated.length > 0);

    const v2 = await StoreService.verifyApiKey(rotated);
    assert.ok(v2 && v2.id === store.id);

    const vOld = await StoreService.verifyApiKey(initial as string);
    assert.equal(vOld, null);
  } finally {
    await prisma.store.delete({ where: { id: store.id } });
  }
});
