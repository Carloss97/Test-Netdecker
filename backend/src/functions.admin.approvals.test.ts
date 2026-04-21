import test from 'node:test';
import assert from 'node:assert/strict';

import * as approvalsModule from './functions/api/admin/approvals.js';
const onRequest = approvalsModule.onRequest || approvalsModule.default?.onRequest || approvalsModule.default || approvalsModule;

class D1Mock {
  constructor() { this.tables = { store: [], priceChangeApproval: [], listing: [], priceHistory: [] }; }
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

        // approvals
        if (low.includes('from pricechangeapproval') && low.includes('where status =')) {
          const status = this.bound && this.bound[0];
          const limit = this.bound && this.bound[1];
          const rows = self.tables.priceChangeApproval.filter((r) => String((r.status || r.STATUS || '')).toUpperCase() === String(status).toUpperCase());
          return { results: rows.slice(0, limit || rows.length) };
        }
        if (low.includes('from pricechangeapproval') && low.includes('where id =')) {
          const id = this.bound && this.bound[0];
          const row = self.tables.priceChangeApproval.find((r) => String(r.id) === String(id));
          return { results: row ? [row] : [] };
        }
        if (low.includes('from pricechangeapproval')) return { results: Array.from(self.tables.priceChangeApproval) };

        if (low.includes('from listing') && low.includes('where id =')) {
          const id = this.bound && this.bound[0];
          const row = self.tables.listing.find((r) => String(r.id) === String(id));
          return { results: row ? [row] : [] };
        }

        return { results: [] };
      },
      async run() {
        // insert into priceHistory
        if (/insert\s+into\s+pricehistory/i.test(low)) {
          const m = sqlStr.match(/insert\s+into\s+pricehistory\s*\(([^)]+)\)\s*values/i);
          let cols = null;
          if (m && m[1]) cols = m[1].split(',').map((s) => s.trim());
          const row = {};
          if (cols && cols.length) {
            for (let i = 0; i < cols.length; i++) row[cols[i]] = this.bound[i];
          }
          self.tables.priceHistory.push(row);
          return { success: true };
        }

        // update priceChangeApproval (generic mapper)
        if (/update\s+pricechangeapproval\s+set/i.test(low) && low.includes('where id =')) {
          const setPart = sqlStr.split(/set/i)[1].split(/where/i)[0];
          const cols = setPart.split(',').map((s) => s.trim().split('=')[0].trim());
          const values = this.bound.slice(0, cols.length);
          const id = this.bound[this.bound.length - 1];
          const row = self.tables.priceChangeApproval.find((r) => String(r.id) === String(id));
          if (row) {
            for (let i = 0; i < cols.length; i++) row[cols[i]] = values[i];
          }
          return { success: true };
        }

        // update listing
        if (/update\s+listing\s+set/i.test(low) && low.includes('where id =')) {
          const setPart = sqlStr.split(/set/i)[1].split(/where/i)[0];
          const cols = setPart.split(',').map((s) => s.trim().split('=')[0].trim());
          const values = this.bound.slice(0, cols.length);
          const id = this.bound[this.bound.length - 1];
          const row = self.tables.listing.find((r) => String(r.id) === String(id));
          if (row) {
            for (let i = 0; i < cols.length; i++) row[cols[i]] = values[i];
          }
          return { success: true };
        }

        // generic insert into priceChangeApproval (not used but safe)
        if (/insert\s+into\s+pricechangeapproval/i.test(low)) {
          const m = sqlStr.match(/insert\s+into\s+pricechangeapproval\s*\(([^)]+)\)\s*values/i);
          let cols = null;
          if (m && m[1]) cols = m[1].split(',').map((s) => s.trim());
          const row = {};
          if (cols && cols.length) for (let i = 0; i < cols.length; i++) row[cols[i]] = this.bound[i];
          self.tables.priceChangeApproval.push(row);
          return { success: true };
        }

        return {};
      }
    };
  }
}

function makeHeaders(map) { return { get: (k) => map[k.toLowerCase()] || map[k] || null }; }
function makeRequest(url, method, headers = {}, body = null) { const req = { url, method, headers: makeHeaders(headers) }; req.json = async () => body; return req; }

test('admin/approvals endpoints: list, approve, reject (D1-safe)', async () => {
  const db = new D1Mock();
  const admin = { id: 'store-admin', slug: 'admin', name: 'Admin Store', apiKeyHash: 'admin-key', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  db.tables.store.push(admin);

  // seed listing
  db.tables.listing.push({ id: 'listing-1', cardId: 'card-1', referencePrice: 10, marginMultiplier: 1.2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

  // seed a pending approval
  db.tables.priceChangeApproval.push({ id: 'app-1', listingId: 'listing-1', oldFinalPrice: 1000, newFinalPrice: 1100, newReferencePrice: 11, marginMultiplier: 1.1, percentChange: 10, status: 'PENDING', requestedBy: 'sync', notes: null, createdAt: new Date().toISOString() });

  // list pending
  const listReq = makeRequest('https://test/api/admin/approvals/pending', 'GET', { 'x-api-key': 'admin-key' });
  const listRes = await onRequest({ request: listReq, env: { TCG_D1: db } });
  const listObj = JSON.parse(await listRes.text());
  assert.equal(listObj.success, true);
  assert.equal(listObj.total, 1);
  assert.equal(listObj.approvals[0].id, 'app-1');

  // approve
  const approveReq = makeRequest('https://test/api/admin/approvals/app-1/approve', 'POST', { 'x-api-key': 'admin-key' }, { processedBy: 'admin-user' });
  const approveRes = await onRequest({ request: approveReq, env: { TCG_D1: db } });
  const approveObj = JSON.parse(await approveRes.text());
  assert.equal(approveObj.success, true);
  assert.equal((approveObj.approval && approveObj.approval.status).toUpperCase(), 'APPROVED');

  // seed a second approval and reject it
  db.tables.priceChangeApproval.push({ id: 'app-2', listingId: 'listing-1', oldFinalPrice: 1000, newFinalPrice: 900, newReferencePrice: 9, marginMultiplier: 1.1, percentChange: -10, status: 'PENDING', requestedBy: 'sync', notes: null, createdAt: new Date().toISOString() });
  const rejectReq = makeRequest('https://test/api/admin/approvals/app-2/reject', 'POST', { 'x-api-key': 'admin-key' }, { processedBy: 'admin-user', reason: 'manual' });
  const rejectRes = await onRequest({ request: rejectReq, env: { TCG_D1: db } });
  const rejectObj = JSON.parse(await rejectRes.text());
  assert.equal(rejectObj.success, true);
  assert.equal((rejectObj.approval && rejectObj.approval.status).toUpperCase(), 'REJECTED');
  assert.equal(rejectObj.approval.notes, 'manual');
});
