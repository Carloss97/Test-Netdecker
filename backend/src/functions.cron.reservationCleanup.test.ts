import test from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('../../legacy/functions/cron/reservation-cleanup.js');
const onRequest = mod.onRequest || mod.default?.onRequest || mod.default || mod;

class D1Mock {
  constructor() { this.tables = { reservation: [], stockMovement: [], listing: [] }; }
  prepare(sql) {
    const self = this;
    const sqlStr = String(sql || '').trim();
    const low = sqlStr.toLowerCase();
    return {
      bound: [],
      bind(...args) { this.bound = args || []; return this; },
      async all() {
        if (low.startsWith('pragma table_info')) return { results: [] };
        if (low.includes('from reservation') && low.includes('where status =')) {
          const status = this.bound && this.bound[0];
          const now = this.bound && this.bound[1];
          const rows = self.tables.reservation.filter((r) => String(r.status) === String(status) && String(r.expiresAt) <= String(now));
          return { results: rows };
        }
        if (low.includes('from stockmovement') && low.includes('where reference =')) {
          const ref = this.bound && this.bound[0];
          const rows = self.tables.stockMovement.filter((r) => String(r.reference) === String(ref));
          return { results: rows };
        }
        return { results: [] };
      },
      async run() {
        if (/create\s+table\s+if\s+not\s+exists\s+reservation/i.test(low) || /create\s+table\s+if\s+not\s+exists\s+stockmovement/i.test(low)) return { success: true };
        if (/insert\s+into\s+stockmovement/i.test(low)) {
          const m = sqlStr.match(/insert\s+into\s+stockmovement\s*\(([^)]+)\)\s*values/i);
          let cols = null;
          if (m && m[1]) cols = m[1].split(',').map((s) => s.trim());
          const row = {};
          if (cols && cols.length) for (let i = 0; i < cols.length; i++) row[cols[i]] = this.bound[i];
          self.tables.stockMovement.push(row);
          return { success: true };
        }
        if (/update\s+listing\s+set/i.test(low) && low.includes('where id =')) {
          const id = this.bound && this.bound[this.bound.length - 1];
          const qty = this.bound && this.bound[0];
          const row = self.tables.listing.find((r) => String(r.id) === String(id));
          if (row) row.quantity = (Number(row.quantity) || 0) + Number(qty || 0);
          return { success: true };
        }
        if (/update\s+reservation\s+set/i.test(low) && low.includes('where id =')) {
          const id = this.bound && this.bound[this.bound.length - 1];
          const row = self.tables.reservation.find((r) => String(r.id) === String(id));
          if (row) row.status = 'EXPIRED';
          return { success: true };
        }
        return {};
      }
    };
  }
}

function makeRequest(url, method = 'GET', headers = {}, body = null) {
  const req = { url, method, headers: { get: (k) => headers[k.toLowerCase()] || headers[k] || null } };
  req.json = async () => body;
  return req;
}

test('cron/reservation-cleanup: reverts OUT movements and marks EXPIRED (D1-safe)', async () => {
  const db = new D1Mock();
  const now = new Date();
  const past = new Date(now.getTime() - 1000 * 60 * 10).toISOString();
  // seed reservation active and expired
  db.tables.reservation.push({ id: 'r1', listingId: 'L1', warehouseId: null, status: 'ACTIVE', expiresAt: past, createdAt: past });
  // seed an OUT movement referencing reservation
  db.tables.stockMovement.push({ id: 'sm1', listingId: 'L1', warehouseId: null, quantity: 2, type: 'OUT', reference: 'reservation:r1', performedBy: 'system', createdAt: past });
  db.tables.listing.push({ id: 'L1', quantity: 1 });

  const req = makeRequest('https://test/cron/reservation-cleanup', 'GET');
  const res = await onRequest({ request: req, env: { TCG_D1: db } });
  const obj = JSON.parse(await res.text());
  assert.equal(obj.success, true);
  assert.equal(obj.processed, 1);
  // listing quantity should have been incremented by 2
  const listing = db.tables.listing.find((l) => l.id === 'L1');
  assert.equal(Number(listing.quantity), 3);
});
