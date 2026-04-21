import { pickDb, ensureSchema } from '../../_shared/d1.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function runInvoiceCleanup(db, env = {}) {
  if (!db) throw new Error('No DB binding');

  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS invoice (
      id TEXT PRIMARY KEY,
      storeId TEXT,
      orderId TEXT,
      invoiceNumber TEXT,
      date TEXT,
      total REAL,
      currency TEXT,
      pdfUrl TEXT,
      createdAt TEXT
    );`).run();

    await db.prepare(`CREATE TABLE IF NOT EXISTS "order" (
      id TEXT PRIMARY KEY,
      storeId TEXT,
      orderNumber TEXT,
      receiptUrl TEXT,
      createdAt TEXT
    );`).run();
  } catch (_) {}

  const retentionDays = Number(env.INVOICE_RETENTION_DAYS ?? '365');
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const invRes = await db.prepare('SELECT id, pdfUrl, createdAt FROM invoice WHERE pdfUrl IS NOT NULL AND createdAt <= ?').bind(cutoff).all();
  const invoices = Array.isArray(invRes?.results) ? invRes.results : (Array.isArray(invRes) ? invRes : []);
  let deletedInvoices = 0;
  for (const inv of invoices) {
    try {
      await db.prepare('UPDATE invoice SET pdfUrl = NULL WHERE id = ?').bind(inv.id).run().catch(() => {});
      deletedInvoices++;
    } catch (e) {}
  }

  const ordRes = await db.prepare('SELECT id, receiptUrl, createdAt FROM "order" WHERE receiptUrl IS NOT NULL AND createdAt <= ?').bind(cutoff).all();
  const orders = Array.isArray(ordRes?.results) ? ordRes.results : (Array.isArray(ordRes) ? ordRes : []);
  let deletedReceipts = 0;
  for (const o of orders) {
    try {
      await db.prepare('UPDATE "order" SET receiptUrl = NULL WHERE id = ?').bind(o.id).run().catch(() => {});
      deletedReceipts++;
    } catch (e) {}
  }

  return { deletedInvoices, deletedReceipts, retentionDays };
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = pickDb(env);
  if (!db) return json({ success: false, error: 'No DB binding' }, 500);
  if (db) await ensureSchema(db);

  try {
    const result = await runInvoiceCleanup(db, env);
    return json({ success: true, ...result });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;
