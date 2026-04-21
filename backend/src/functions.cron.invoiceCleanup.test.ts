import test from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('./functions/cron/invoice-cleanup.js');
const onRequest = mod.onRequest || mod.default?.onRequest || mod.default || mod;

class D1Mock {
  constructor() { this.tables = { invoice: [], order: [] }; }
  prepare(sql) {
    const self = this;
    const sqlStr = String(sql || '').trim();
    const low = sqlStr.toLowerCase();
    return {
      bound: [],
      bind(...args) { this.bound = args || []; return this; },
      async all() {
        if (low.startsWith('pragma table_info')) return { results: [] };

        // invoices selection
        if (low.includes('from invoice') && low.includes('pdfurl is not null')) {
          const cutoff = this.bound && this.bound[0];
          const rows = self.tables.invoice.filter((i) => i.pdfUrl != null && String(i.createdAt) <= String(cutoff));
          return { results: rows };
        }

        // orders selection (match receiptUrl)
        if (low.includes('receipturl') && low.includes('from')) {
          const cutoff = this.bound && this.bound[0];
          const rows = self.tables.order.filter((o) => o.receiptUrl != null && String(o.createdAt) <= String(cutoff));
          return { results: rows };
        }

        return { results: [] };
      },
      async run() {
        if (/create\s+table\s+if\s+not\s+exists/i.test(low)) return { success: true };
        if (/update\s+invoice\s+set\s+pdfurl/i.test(low) && low.includes('where id =')) {
          const id = this.bound && this.bound[0];
          const row = self.tables.invoice.find((r) => String(r.id) === String(id));
          if (row) row.pdfUrl = null;
          return { success: true };
        }
        if (/update\s+"?order"?\s+set\s+receipturl/i.test(low) && low.includes('where id =')) {
          const id = this.bound && this.bound[0];
          const row = self.tables.order.find((r) => String(r.id) === String(id));
          if (row) row.receiptUrl = null;
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

test('cron/invoice-cleanup: clears pdfUrl and receiptUrl older than retention', async () => {
  const db = new D1Mock();
  const past = new Date(Date.now() - 1000 * 60 * 60 * 24 * 400).toISOString(); // 400 days ago

  db.tables.invoice.push({ id: 'inv-1', pdfUrl: 'a.pdf', createdAt: past });
  db.tables.order.push({ id: 'ord-1', receiptUrl: 'r.pdf', createdAt: past });

  const req = makeRequest('https://test/cron/invoice-cleanup', 'GET');
  const res = await onRequest({ request: req, env: { TCG_D1: db, INVOICE_RETENTION_DAYS: '365' } });
  const obj = JSON.parse(await res.text());
  assert.equal(obj.success, true);
  assert.equal(obj.deletedInvoices, 1);
  assert.equal(obj.deletedReceipts, 1);
  assert.equal(db.tables.invoice[0].pdfUrl, null);
  assert.equal(db.tables.order[0].receiptUrl, null);
});
