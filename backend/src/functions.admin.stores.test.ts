import test from 'node:test';
import assert from 'node:assert/strict';
// import module dynamically and support different export shapes (named or default)
const storesModule = await import('../../legacy/functions/api/admin/stores.js');
const onRequest = storesModule.onRequest || storesModule.default?.onRequest || storesModule.default || storesModule;

// Minimal D1 mock used for functions unit tests. Implements prepare().bind().all()/run()
class D1Mock {
  constructor() {
    this.tables = { store: [] };
  }

  prepare(sql) {
    const self = this;
    const sqlStr = String(sql || '').trim();
    const low = sqlStr.toLowerCase();
    const prepared = {
      bound: [],
      bind(...args) { this.bound = args || []; return this; },
      async all() {
        // PRAGMA support -> return empty schema for unknown tables
        if (low.startsWith('pragma table_info')) return { results: [] };

        // SELECT id, slug, name FROM store WHERE slug = ?
        if (low.includes('from store') && low.includes('where slug =')) {
          const slug = this.bound && this.bound[0];
          const found = self.tables.store.find((r) => String(r.slug) === String(slug));
          return { results: found ? [found] : [] };
        }

        // SELECT id, slug, name, apiKeyHash FROM store WHERE apiKeyHash IS NOT NULL
        if (low.includes('from store') && low.includes('apikeyhash is not null')) {
          const rows = self.tables.store.filter((r) => r.apiKeyHash != null && r.apiKeyHash !== '');
          return { results: rows };
        }

        // Generic list stores
        if (low.includes('select') && low.includes('from store')) {
          return { results: Array.from(self.tables.store) };
        }

        return { results: [] };
      },
      async run() {
        // CREATE TABLE - no-op
        if (low.startsWith('create table')) return {};

        // INSERT INTO store (...) VALUES (?,...)
        if (/insert\s+into\s+store/i.test(low)) {
          // Extract column names if present
          const m = sqlStr.match(/insert\s+into\s+store\s*\(([^)]+)\)\s*values/i);
          let cols = null;
          if (m && m[1]) {
            cols = m[1].split(',').map((s) => s.trim());
          }
          const row = {};
          if (cols && cols.length) {
            for (let i = 0; i < cols.length; i++) {
              const col = cols[i];
              row[col] = this.bound[i];
            }
          } else {
            // fallback: use generic keys
            row.id = this.bound[0];
            row.slug = this.bound[1];
            row.name = this.bound[2];
          }
          // store row
          self.tables.store.push(row);
          return { success: true };
        }

        // UPDATE store SET ... WHERE id = ?
        if (/update\s+store\s+set/i.test(low) && low.includes('where id =')) {
          // crude parse of set columns
          const setPart = sqlStr.split(/set/i)[1].split(/where/i)[0];
          const cols = setPart.split(',').map((s) => s.trim().split('=')[0].trim());
          // last bound is id
          const id = this.bound[this.bound.length - 1];
          const updatedAt = this.bound[this.bound.length - 2];
          const values = this.bound.slice(0, this.bound.length - 2);
          const row = self.tables.store.find((r) => String(r.id) === String(id));
          if (row) {
            for (let i = 0; i < values.length; i++) {
              const col = cols[i];
              row[col] = values[i];
            }
            row.updatedAt = updatedAt;
          }
          return { success: true };
        }

        return {};
      }
    };
    return prepared;
  }
}

function makeHeaders(map) {
  return { get: (k) => map[k.toLowerCase()] || map[k] || null };
}

function makeRequest(url, method, headers = {}, body = null) {
  const req: any = { url, method, headers: makeHeaders(headers) } as any;
  req.json = async () => body;
  return req;
}

test('admin/stores endpoints: list, create, rotate, update (D1-safe)', async () => {
  const db = new D1Mock();
  // seed an admin store (plain api key for simplicity)
  const admin = { id: 'store-admin', slug: 'admin', name: 'Admin Store', apiKeyHash: 'admin-key', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  db.tables.store.push(admin);

  // 1) list stores
  const listReq = makeRequest('https://test/api/admin/stores', 'GET', { 'x-api-key': 'admin-key' });
  const listRes: any = await onRequest({ request: listReq, env: { TCG_D1: db } });
  const listText = await listRes.text();
  const listObj = JSON.parse(listText);
  assert.equal(listObj.success, true);
  assert.ok(Array.isArray(listObj.stores));
  assert.ok(listObj.stores.find((s: any) => s.slug === 'admin'));

  // 2) create store
  const createReq = makeRequest('https://test/api/admin/stores', 'POST', { 'x-api-key': 'admin-key' }, { slug: 'test-store', name: 'Test Store' });
  const createRes: any = await onRequest({ request: createReq, env: { TCG_D1: db } });
  const createText = await createRes.text();
  const createObj = JSON.parse(createText);
  assert.equal(createObj.success, true);
  assert.ok(createObj.apiKey, 'should return new apiKey');

  // find created store id via list
  const afterListRes: any = await onRequest({ request: listReq, env: { TCG_D1: db } });
  const afterList = JSON.parse(await afterListRes.text());
  const created = afterList.stores.find((s: any) => s.slug === 'test-store');
  assert.ok(created, 'created store should appear in list');

  // 3) rotate api key
  const rotateReq = makeRequest(`https://test/api/admin/stores/${created.id}/rotate`, 'POST', { 'x-api-key': 'admin-key' });
  const rotateRes: any = await onRequest({ request: rotateReq, env: { TCG_D1: db } });
  const rotateObj = JSON.parse(await rotateRes.text());
  assert.equal(rotateObj.success, true);
  assert.ok(rotateObj.apiKey, 'rotate should return new apiKey');

  // 4) update store
  const updateReq = makeRequest(`https://test/api/admin/stores/${created.id}`, 'PATCH', { 'x-api-key': 'admin-key' }, { name: 'Updated Name', currency: 'USD', taxRate: 10 });
  const updateRes: any = await onRequest({ request: updateReq, env: { TCG_D1: db } });
  const updateObj = JSON.parse(await updateRes.text());
  assert.equal(updateObj.success, true);

  // verify update applied
  const finalList = JSON.parse(await (await onRequest({ request: listReq, env: { TCG_D1: db } })).text());
  const updated = finalList.stores.find((s: any) => s.id === created.id);
  assert.ok(updated, 'updated store should exist');
  assert.equal(updated.name, 'Updated Name');
  assert.equal(updated.currency, 'USD');
  // taxRate may be string or number depending on storage
  assert.equal(Number(updated.taxRate), 10);
});
