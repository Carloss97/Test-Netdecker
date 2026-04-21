import test from 'node:test';
import assert from 'node:assert/strict';

const thresholdsModule = await import('../../legacy/functions/api/admin/pricing/thresholds.js');
const onRequest = thresholdsModule.onRequest || thresholdsModule.default?.onRequest || thresholdsModule.default || thresholdsModule;

class D1Mock {
  constructor() { this.tables = { store: [], priceVolatilityThreshold: [] }; }
  prepare(sql) {
    const self = this;
    const sqlStr = String(sql || '').trim();
    const low = sqlStr.toLowerCase();
    return {
      bound: [],
      bind(...args) { this.bound = args || []; return this; },
      async all() {
        if (low.startsWith('pragma table_info')) return { results: [] };

        // store lookups for auth
        if (low.includes('from store') && low.includes('where slug =')) {
          const slug = this.bound && this.bound[0];
          const found = self.tables.store.find((r) => String(r.slug) === String(slug));
          return { results: found ? [found] : [] };
        }
        if (low.includes('from store') && low.includes('apikeyhash is not null')) {
          const rows = self.tables.store.filter((r) => r.apiKeyHash != null && r.apiKeyHash !== '');
          return { results: rows };
        }
        if (low.includes('select') && low.includes('from store')) return { results: Array.from(self.tables.store) };

        if (low.includes('from pricevolatilitythreshold') && low.includes('where')) {
          // simple filtering by tcg or editionId (first bound)
          if (low.includes('tcg = ?')) {
            const tcg = this.bound[0];
            return { results: self.tables.priceVolatilityThreshold.filter((r) => String(r.tcg) === String(tcg)) };
          }
          if (low.includes('editionid = ?')) {
            const editionId = this.bound[0];
            return { results: self.tables.priceVolatilityThreshold.filter((r) => String(r.editionId) === String(editionId)) };
          }
        }
        if (low.includes('from pricevolatilitythreshold')) return { results: Array.from(self.tables.priceVolatilityThreshold) };
        return { results: [] };
      },
      async run() {
        if (/insert\s+into\s+pricevolatilitythreshold/i.test(low)) {
          const m = sqlStr.match(/insert\s+into\s+pricevolatilitythreshold\s*\(([^)]+)\)\s*values/i);
          let cols = null;
          if (m && m[1]) cols = m[1].split(',').map((s) => s.trim());
          const row = {};
          if (cols && cols.length) for (let i = 0; i < cols.length; i++) row[cols[i]] = this.bound[i];
          self.tables.priceVolatilityThreshold.push(row);
          return { success: true };
        }
        if (/update\s+pricevolatilitythreshold\s+set/i.test(low) && low.includes('where id =')) {
          const setPart = sqlStr.split(/set/i)[1].split(/where/i)[0];
          const cols = setPart.split(',').map((s) => s.trim().split('=')[0].trim());
          const id = this.bound[this.bound.length - 1];
          const updatedAt = this.bound[this.bound.length - 2];
          const values = this.bound.slice(0, this.bound.length - 2);
          const row = self.tables.priceVolatilityThreshold.find((r) => String(r.id) === String(id));
          if (row) {
            for (let i = 0; i < values.length; i++) row[cols[i]] = values[i];
            row.updatedAt = updatedAt;
          }
          return { success: true };
        }
        if (/delete\s+from\s+pricevolatilitythreshold/i.test(low)) {
          const id = this.bound && this.bound[0];
          self.tables.priceVolatilityThreshold = self.tables.priceVolatilityThreshold.filter((r) => String(r.id) !== String(id));
          return { success: true };
        }
        return {};
      }
    };
  }
}

function makeHeaders(map) { return { get: (k) => map[k.toLowerCase()] || map[k] || null }; }
function makeRequest(url, method, headers = {}, body = null) { const req = { url, method, headers: makeHeaders(headers) }; req.json = async () => body; return req; }

test('admin/pricing/thresholds endpoints: CRUD (D1-safe)', async () => {
  const db = new D1Mock();
  const admin = { id: 'store-admin', slug: 'admin', name: 'Admin Store', apiKeyHash: 'admin-key', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  db.tables.store.push(admin);

  // initially empty
  const listReq0 = makeRequest('https://test/api/admin/pricing/thresholds', 'GET', { 'x-api-key': 'admin-key' });
  const list0 = JSON.parse(await (await onRequest({ request: listReq0, env: { TCG_D1: db } })).text());
  assert.equal(list0.success, true);
  assert.equal(list0.total, 0);

  // create
  const createReq = makeRequest('https://test/api/admin/pricing/thresholds', 'POST', { 'x-api-key': 'admin-key' }, { tcg: 'MAGIC', editionId: null, thresholdPercent: 12.5 });
  const createObj = JSON.parse(await (await onRequest({ request: createReq, env: { TCG_D1: db } })).text());
  assert.equal(createObj.success, true);
  const id = createObj.threshold.id;

  // list now
  const list1 = JSON.parse(await (await onRequest({ request: listReq0, env: { TCG_D1: db } })).text());
  assert.equal(list1.total, 1);

  // patch
  const patchReq = makeRequest(`https://test/api/admin/pricing/thresholds/${id}`, 'PATCH', { 'x-api-key': 'admin-key' }, { thresholdPercent: 15 });
  const patchRes = JSON.parse(await (await onRequest({ request: patchReq, env: { TCG_D1: db } })).text());
  assert.equal(patchRes.success, true);

  // delete
  const delReq = makeRequest(`https://test/api/admin/pricing/thresholds/${id}`, 'DELETE', { 'x-api-key': 'admin-key' });
  const delRes = JSON.parse(await (await onRequest({ request: delReq, env: { TCG_D1: db } })).text());
  assert.equal(delRes.success, true);
});
