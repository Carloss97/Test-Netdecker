import test from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('../../legacy/functions/cron/cart-cleanup.js');
const onRequest = mod.onRequest || mod.default?.onRequest || mod.default || mod;

class D1Mock {
  constructor() { this.tables = { cart: [], orderItem: [] }; }
  prepare(sql) {
    const self = this;
    const sqlStr = String(sql || '').trim();
    const low = sqlStr.toLowerCase();
    return {
      bound: [],
      bind(...args) { this.bound = args || []; return this; },
      async all() {
        if (low.startsWith('pragma table_info')) return { results: [] };

        if (low.includes('select') && low.includes('from cart') && low.includes('where updatedat <')) {
          const cutoff = this.bound && this.bound[0];
          const rows = self.tables.cart.filter((r) => String(r.updatedAt) < String(cutoff));
          return { results: rows };
        }

        if (low.includes('select') && low.includes('from cart')) return { results: Array.from(self.tables.cart) };
        if (low.includes('from orderitem')) return { results: Array.from(self.tables.orderItem) };
        return { results: [] };
      },
      async run() {
        if (/create\s+table\s+if\s+not\s+exists\s+cart/i.test(low) || /create\s+table\s+if\s+not\s+exists\s+orderitem/i.test(low)) {
          return { success: true };
        }

        if (/delete\s+from\s+orderitem/i.test(low) && low.includes('where cartid =') && low.includes('orderid is null')) {
          const cartId = this.bound && this.bound[0];
          const before = self.tables.orderItem.length;
          self.tables.orderItem = self.tables.orderItem.filter((r) => !(String(r.cartId) === String(cartId) && (r.orderId === null || r.orderId === undefined)));
          const after = self.tables.orderItem.length;
          return { changes: before - after };
        }

        if (/delete\s+from\s+cart/i.test(low) && low.includes('where id =')) {
          const id = this.bound && this.bound[0];
          self.tables.cart = self.tables.cart.filter((r) => String(r.id) !== String(id));
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

test('cron/cart-cleanup: deletes orphan items and carts (D1-safe)', async () => {
  const db = new D1Mock();

  // seed a cart older than cutoff
  const old = new Date(Date.now() - 1000 * 60 * 120).toISOString(); // 120 minutes ago
  db.tables.cart.push({ id: 'c1', sessionId: 's1', updatedAt: old });
  db.tables.orderItem.push({ id: 'oi1', cartId: 'c1', orderId: null, listingId: 'L1', quantity: 1, createdAt: old });

  const req = makeRequest('https://test/cron/cart-cleanup', 'GET');
  const res = await onRequest({ request: req, env: { TCG_D1: db, CART_EXPIRY_MINUTES: '60' } });
  const obj = JSON.parse(await res.text());
  assert.equal(obj.success, true);
  assert.equal(obj.deletedCarts, 1);
});
