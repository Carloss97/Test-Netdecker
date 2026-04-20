import { pickDb, ensureSchema } from '../../_shared/d1.js';
import { getOrderById } from '../../_shared/orders.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const take = Math.min(Number(url.searchParams.get('take') || '20'), 100);
    const skip = Number(url.searchParams.get('skip') || '0');
    const status = url.searchParams.get('status') ? String(url.searchParams.get('status')).toUpperCase() : null;

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    const binds = [];
    let where = '';
    if (status) { where = 'WHERE status = ?'; binds.push(status); }

    const rowsRes = await db.prepare(`SELECT id, storeId, orderNumber, customerEmail, status, subtotal, tax, total, notes, receiptUrl, createdAt, updatedAt FROM "order" ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`).bind(...binds, take, skip).all();
    const rows = Array.isArray(rowsRes?.results) ? rowsRes.results : (Array.isArray(rowsRes) ? rowsRes : []);

    // total count
    const countRes = await db.prepare(`SELECT COUNT(*) AS cnt FROM "order" ${where}`).bind(...binds).all();
    const total = (Array.isArray(countRes?.results) ? countRes.results[0] : (Array.isArray(countRes) ? countRes[0] : null))?.cnt || 0;

    // fetch items in batch
    const orderIds = rows.map((r) => r.id).filter(Boolean);
    let itemsMap = new Map();
    if (orderIds.length > 0) {
      const ph = orderIds.map(() => '?').join(',');
      const itemsRes = await db.prepare(`SELECT id, orderId, listingId, quantity, pricePerUnit, subtotal, createdAt FROM orderItem WHERE orderId IN (${ph})`).bind(...orderIds).all();
      const items = Array.isArray(itemsRes?.results) ? itemsRes.results : (Array.isArray(itemsRes) ? itemsRes : []);
      for (const it of items) {
        const oid = it.orderId;
        if (!itemsMap.has(oid)) itemsMap.set(oid, []);
        itemsMap.get(oid).push(it);
      }
    }

    const out = rows.map((r) => ({ ...r, items: itemsMap.get(r.id) || [] }));
    return new Response(JSON.stringify({ success: true, total: Number(total || 0), orders: out }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
