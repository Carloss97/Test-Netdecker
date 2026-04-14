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

test('StoreService.createStore accepts currency and taxRate and updateStore works', async () => {
  const slug = `svc-create-${Date.now()}`;
  const name = 'Service Create With Settings Test';

  const { store, apiKey } = await StoreService.createStore({ slug, name, currency: 'USD', taxRate: 19 });
  try {
    assert.equal(store.currency, 'USD');
    assert.equal(Number(store.taxRate), 19);

    const updated = await StoreService.updateStore(store.id, { currency: 'CLP', taxRate: 0 });
    assert.equal(updated.currency, 'CLP');
    assert.equal(Number(updated.taxRate), 0);
  } finally {
    await prisma.store.delete({ where: { id: store.id } });
  }
});
