import test from 'node:test';
import assert from 'node:assert/strict';

class MockDB {
  constructor() {
    this.listing = {};
    this.reservation = {};
    this.stockMovement = {};
    this.stockSnapshot = {};
  }

  prepare(sql) {
    const self = this;
    // capture column list if present
    const colsMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
    const columns = colsMatch ? colsMatch[1].split(',').map((s) => s.trim().replace(/['"]["']?/g, '')) : [];
    return {
      bind(...args) { this.args = args; this.sql = sql; this.columns = columns; return this; },
      async all() {
        const sql = this.sql;
        const args = this.args || [];
        if (/SELECT\s+id,\s*quantity\s+FROM\s+listing\s+WHERE\s+id\s*\=\s*\?/i.test(sql)) {
          const id = args[0];
          if (!self.listing[id]) return { results: [] };
          return { results: [{ id, quantity: self.listing[id].quantity }] };
        }

        // support SELECT id FROM listing WHERE id = ? (used by transfer endpoint)
        if (/SELECT\s+id\s+FROM\s+listing\s+WHERE\s+id\s*\=\s*\?/i.test(sql)) {
          const id = args[0];
          if (!self.listing[id]) return { results: [] };
          return { results: [{ id }] };
        }

        if (/SELECT\s+id,\s*listingId,\s*warehouseId,\s*quantity,\s*type\s+FROM\s+stockMovement\s+WHERE\s+reference\s*=\s*\?/i.test(sql)) {
          const ref = args[0];
          const rows = Object.values(self.stockMovement).filter((m) => m.reference === ref).map((m) => ({ id: m.id, listingId: m.listingId, warehouseId: m.warehouseId, quantity: m.quantity, type: m.type }));
          return { results: rows };
        }

        if (/FROM\s+reservation\s+WHERE\s+id\s*\=\s*\?/i.test(sql)) {
          const id = args[0];
          const r = self.reservation[id];
          if (!r) return { results: [] };
          // return full reservation object (matching requested columns)
          return { results: [r] };
        }

        if (/SELECT\s+id,\s*listingId,\s*warehouseId\s+FROM\s+reservation\s+WHERE\s+status\s*=\s*\?\s+AND\s+expiresAt\s*<=\s*\?/i.test(sql)) {
          const status = args[0]; const now = args[1];
          const rows = Object.values(self.reservation).filter((r) => r.status === status && r.expiresAt && r.expiresAt <= now).map((r) => ({ id: r.id, listingId: r.listingId, warehouseId: r.warehouseId }));
          return { results: rows };
        }

        return { results: [] };
      },
      async run() {
        const sql = this.sql;
        const args = this.args || [];
        // Increase quantity
        if (/UPDATE\s+listing\s+SET\s+quantity\s*=\s*COALESCE\(quantity,0\)\s*\+\s*\?/i.test(sql)) {
          const q = Number(args[0]); const id = args[1];
          const l = self.listing[id] ||= { id, quantity: 0 };
          l.quantity = (Number(l.quantity) || 0) + q;
          return { changes: 1 };
        }

        // Decrease quantity
        if (/UPDATE\s+listing\s+SET\s+quantity\s*=\s*quantity\s*-\s*\?/i.test(sql)) {
          const q = Number(args[0]); const id = args[1];
          const l = self.listing[id];
          if (!l) return { changes: 0 };
          l.quantity = (Number(l.quantity) || 0) - q;
          return { changes: 1 };
        }

        // Set listing quantity
        if (/UPDATE\s+listing\s+SET\s+quantity\s*=\s*\?/i.test(sql) && /WHERE\s+id\s*=\s*\?/i.test(sql)) {
          const q = Number(args[0]); const id = args[1];
          const l = self.listing[id] ||= { id, quantity: 0 };
          l.quantity = q;
          return { changes: 1 };
        }

        // Generic INSERT handling using captured column names
        if (/INSERT\s+INTO\s+stockMovement/i.test(sql)) {
          const id = args[0];
          let qty = null;
          if (this.columns && this.columns.length) {
            const qi = this.columns.findIndex((c) => /quantity/i.test(c));
            if (qi >= 0) qty = Number(args[qi]);
          } else {
            qty = Number(args[5]);
          }
          const listingId = args[1];
          const typeIdx = this.columns ? this.columns.findIndex((c) => /type/i.test(c)) : 6;
          const type = (typeIdx >= 0 ? args[typeIdx] : args[6]) || 'OUT';
          const refIdx = this.columns ? this.columns.findIndex((c) => /reference/i.test(c)) : 7;
          const reference = refIdx >= 0 ? args[refIdx] : null;
          const perfIdx = this.columns ? this.columns.findIndex((c) => /performedBy/i.test(c)) : 8;
          const performedBy = perfIdx >= 0 ? args[perfIdx] : null;
          const whIdx = this.columns ? this.columns.findIndex((c) => /warehouseId/i.test(c)) : 2;
          const warehouseId = whIdx >= 0 ? args[whIdx] : null;
          self.stockMovement[id] = { id, listingId, quantity: qty, type, reference, performedBy, warehouseId };
          return { changes: 1 };
        }

        if (/INSERT\s+INTO\s+reservation/i.test(sql)) {
          const id = args[0]; const listingId = args[1]; const warehouseId = args[2]; const quantity = Number(args[3]); const reservedBy = args[4]; const expiresAt = args[5]; const status = args[6]; const createdAt = args[7]; const updatedAt = args[8];
          self.reservation[id] = { id, listingId, warehouseId, quantity, reservedBy, expiresAt, status, createdAt, updatedAt };
          return { changes: 1 };
        }

        if (/INSERT\s+INTO\s+stockSnapshot/i.test(sql)) {
          const id = args[0]; const listingId = args[1]; const warehouseId = args[2]; const quantity = Number(args[3]); const takenAt = args[4];
          self.stockSnapshot[id] = { id, listingId, warehouseId, quantity, takenAt };
          return { changes: 1 };
        }

        if (/UPDATE\s+reservation\s+SET\s+status\s*=\s*\?/i.test(sql)) {
          const status = args[0]; const updatedAt = args[1]; const id = args[2];
          if (self.reservation[id]) { self.reservation[id].status = status; self.reservation[id].updatedAt = updatedAt; return { changes: 1 }; }
          return { changes: 0 };
        }

        return { changes: 0 };
      }
    };
  }
}

test('stock movement IN increments listing quantity and inserts movement', async () => {
  const db = new MockDB();
  db.listing['L1'] = { id: 'L1', quantity: 10 };
  const mod = await import('../../legacy/functions/api/erp/stock/movement.js');
  const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ listingId: 'L1', type: 'IN', quantity: 5 }), headers: { 'Content-Type': 'application/json' } });
  const res = await mod.onRequest({ request: req, env: { TCG_D1: db } });
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(db.listing['L1'].quantity, 15);
});

test('stock movement OUT with insufficient stock returns 409', async () => {
  const db = new MockDB();
  db.listing['L2'] = { id: 'L2', quantity: 2 };
  const mod = await import('../../legacy/functions/api/erp/stock/movement.js');
  const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ listingId: 'L2', type: 'OUT', quantity: 3 }), headers: { 'Content-Type': 'application/json' } });
  const res = await mod.onRequest({ request: req, env: { TCG_D1: db } });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.success, false);
});

test('snapshot creates snapshot record with current listing quantity', async () => {
  const db = new MockDB();
  db.listing['L3'] = { id: 'L3', quantity: 7 };
  const mod = await import('../../legacy/functions/api/erp/stock/snapshot.js');
  const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ listingId: 'L3' }), headers: { 'Content-Type': 'application/json' } });
  const res = await mod.onRequest({ request: req, env: { TCG_D1: db } });
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(Object.keys(db.stockSnapshot).length, 1);
  const snap = Object.values(db.stockSnapshot)[0];
  assert.equal(snap.listingId, 'L3');
  assert.equal(snap.quantity, 7);
});

test('transfer inserts transfer movement without altering listing quantity', async () => {
  const db = new MockDB();
  db.listing['L4'] = { id: 'L4', quantity: 20 };
  const mod = await import('../../legacy/functions/api/erp/stock/transfer.js');
  const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ listingId: 'L4', fromWarehouseId: 'W1', toWarehouseId: 'W2', quantity: 5 }), headers: { 'Content-Type': 'application/json' } });
  const res = await mod.onRequest({ request: req, env: { TCG_D1: db } });
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(db.listing['L4'].quantity, 20);
  assert.equal(Object.values(db.stockMovement).length, 1);
});

test('reservations create, commit and release flows', async () => {
  const db = new MockDB();
  db.listing['L5'] = { id: 'L5', quantity: 10 };
  const resIndex = await import('../../legacy/functions/api/erp/reservations/index.js');
  const resCommit = await import('../../legacy/functions/api/erp/reservations/[id]/commit.js');
  const resRelease = await import('../../legacy/functions/api/erp/reservations/[id]/release.js');

  // create reservation
  const createReq = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ listingId: 'L5', quantity: 3 }), headers: { 'Content-Type': 'application/json' } });
  const createRes = await resIndex.onRequest({ request: createReq, env: { TCG_D1: db } });
  const createBody = await createRes.json();
  assert.equal(createBody.success, true);
  const reservationId = createBody.reservation.id;
  assert.ok(reservationId);

  // commit reservation
  const commitReq = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ performedBy: 'tester' }), headers: { 'Content-Type': 'application/json' } });
  const commitRes = await resCommit.onRequest({ request: commitReq, env: { TCG_D1: db }, params: { id: reservationId } });
  const commitBody = await commitRes.json();
  assert.equal(commitBody.success, true);
  assert.equal(db.reservation[reservationId].status, 'COMMITTED');
  assert.equal(db.listing['L5'].quantity, 7);

  // create another reservation and release
  const createReq2 = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ listingId: 'L5', quantity: 2 }), headers: { 'Content-Type': 'application/json' } });
  const createRes2 = await resIndex.onRequest({ request: createReq2, env: { TCG_D1: db } });
  const createBody2 = await createRes2.json();
  const res2Id = createBody2.reservation.id;

  const releaseReq = new Request('http://localhost', { method: 'POST' });
  const releaseRes = await resRelease.onRequest({ env: { TCG_D1: db }, params: { id: res2Id } });
  const releaseBody = await releaseRes.json();
  assert.equal(releaseBody.success, true);
  assert.equal(db.reservation[res2Id].status, 'RELEASED');
});
