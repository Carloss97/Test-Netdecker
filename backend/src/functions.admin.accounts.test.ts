import test from 'node:test';
import assert from 'node:assert/strict';

const accountsModule = await import('../../functions/api/admin/accounts.js');
const onRequest = accountsModule.onRequest || accountsModule.default?.onRequest || accountsModule.default || accountsModule;

class D1Mock {
  constructor() {
    this.tables = { store: [], account: [], journalLine: [] };
  }
  prepare(sql) {
    const self = this;
    const sqlStr = String(sql || '').trim();
    const low = sqlStr.toLowerCase();
    const prepared = {
      bound: [],
      bind(...args) { this.bound = args || []; return this; },
      async all() {
        if (low.startsWith('pragma table_info')) return { results: [] };

        // store lookups (used by resolveStoreFromRequest)
        if (low.includes('from store') && low.includes('where slug =')) {
          const slug = this.bound && this.bound[0];
          const found = self.tables.store.find((r) => String(r.slug) === String(slug));
          return { results: found ? [found] : [] };
        }
        if (low.includes('from store') && low.includes('apikeyhash is not null')) {
          const rows = self.tables.store.filter((r) => r.apiKeyHash != null && r.apiKeyHash !== '');
          return { results: rows };
        }
        if (low.includes('select') && low.includes('from store')) {
          return { results: Array.from(self.tables.store) };
        }

        if (low.includes('from account') && low.includes('where storeid =')) {
          const storeId = this.bound && this.bound[0];
          const rows = self.tables.account.filter((r) => String(r.storeId) === String(storeId));
          return { results: rows };
        }
        if (low.includes('from account') && low.includes('where id =')) {
          const id = this.bound && this.bound[0];
          const row = self.tables.account.find((r) => String(r.id) === String(id));
          return { results: row ? [row] : [] };
        }
        if (low.includes('from journalline') && low.includes('where accountid =')) {
          const id = this.bound && this.bound[0];
          const rows = self.tables.journalLine.filter((r) => String(r.accountId) === String(id));
          return { results: rows };
        }
        if (low.includes('from account')) return { results: Array.from(self.tables.account) };
        return { results: [] };
      },
      async run() {
        if (/insert\s+into\s+account/i.test(low)) {
          const m = sqlStr.match(/insert\s+into\s+account\s*\(([^)]+)\)\s*values/i);
          let cols = null;
          if (m && m[1]) cols = m[1].split(',').map((s) => s.trim());
          const row = {};
          if (cols && cols.length) {
            for (let i = 0; i < cols.length; i++) row[cols[i]] = this.bound[i];
          } else {
            row.id = this.bound[0]; row.storeId = this.bound[1]; row.code = this.bound[2]; row.name = this.bound[3];
          }
          self.tables.account.push(row);
          return { success: true };
        }
        if (/update\s+account\s+set/i.test(low) && low.includes('where id =')) {
          const setPart = sqlStr.split(/set/i)[1].split(/where/i)[0];
          const cols = setPart.split(',').map((s) => s.trim().split('=')[0].trim());
          const id = this.bound[this.bound.length - 1];
          const updatedAt = this.bound[this.bound.length - 2];
          const values = this.bound.slice(0, this.bound.length - 2);
          const row = self.tables.account.find((r) => String(r.id) === String(id));
          if (row) {
            for (let i = 0; i < values.length; i++) row[cols[i]] = values[i];
            row.updatedAt = updatedAt;
          }
          return { success: true };
        }
        if (/delete\s+from\s+account/i.test(low) && low.includes('where id =')) {
          const id = this.bound && this.bound[0];
          self.tables.account = self.tables.account.filter((r) => String(r.id) !== String(id));
          return { success: true };
        }
        return {};
      }
    };
    return prepared;
  }
}

function makeHeaders(map) { return { get: (k) => map[k.toLowerCase()] || map[k] || null }; }
function makeRequest(url, method, headers = {}, body = null) {
  const req = { url, method, headers: makeHeaders(headers) };
  req.json = async () => body;
  return req;
}

test('admin/accounts endpoints: create, list, update, delete (D1-safe)', async () => {
  const db = new D1Mock();
  const admin = { id: 'store-admin', slug: 'admin', name: 'Admin Store', apiKeyHash: 'admin-key', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  db.tables.store.push(admin);

  // create account
  const createReq = makeRequest('https://test/api/admin/accounts', 'POST', { 'x-api-key': 'admin-key' }, { storeId: 'store-admin', code: '101', name: 'Cash', type: 'ASSET' });
  const createRes = await onRequest({ request: createReq, env: { TCG_D1: db } });
  const createObj = JSON.parse(await createRes.text());
  assert.equal(createObj.success, true);
  assert.ok(createObj.account && createObj.account.id);
  const accId = createObj.account.id;

  // list accounts for store
  const listReq = makeRequest('https://test/api/admin/accounts?storeId=store-admin', 'GET', { 'x-api-key': 'admin-key' });
  const listRes = await onRequest({ request: listReq, env: { TCG_D1: db } });
  const listObj = JSON.parse(await listRes.text());
  assert.equal(listObj.success, true);
  assert.ok(Array.isArray(listObj.accounts));
  assert.ok(listObj.accounts.find((a) => a.id === accId));

  // update account
  const updateReq = makeRequest(`https://test/api/admin/accounts/${accId}`, 'PATCH', { 'x-api-key': 'admin-key' }, { name: 'Cashbox' });
  const updateRes = await onRequest({ request: updateReq, env: { TCG_D1: db } });
  const updateObj = JSON.parse(await updateRes.text());
  assert.equal(updateObj.success, true);

  // delete account (no journal lines)
  const deleteReq = makeRequest(`https://test/api/admin/accounts/${accId}`, 'DELETE', { 'x-api-key': 'admin-key' });
  const deleteRes = await onRequest({ request: deleteReq, env: { TCG_D1: db } });
  const deleteObj = JSON.parse(await deleteRes.text());
  assert.equal(deleteObj.success, true);

  // create second account then reference it from a journalLine and ensure delete fails
  const createReq2 = makeRequest('https://test/api/admin/accounts', 'POST', { 'x-api-key': 'admin-key' }, { storeId: 'store-admin', code: '102', name: 'Sales', type: 'REVENUE' });
  const createObj2 = JSON.parse(await (await onRequest({ request: createReq2, env: { TCG_D1: db } })).text());
  const acc2 = createObj2.account;
  // add journalLine referencing acc2
  db.tables.journalLine.push({ id: 'jl-1', accountId: acc2.id, amount: 100 });

  const deleteReq2 = makeRequest(`https://test/api/admin/accounts/${acc2.id}`, 'DELETE', { 'x-api-key': 'admin-key' });
  const deleteObj2 = JSON.parse(await (await onRequest({ request: deleteReq2, env: { TCG_D1: db } })).text());
  assert.equal(deleteObj2.success, false);
  assert.ok(/used/i.test(deleteObj2.error || ''), 'should indicate account is used');
});
