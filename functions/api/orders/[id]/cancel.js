import { pickDb, ensureSchema, firstRow } from '../../../../_shared/d1.js';
import { getOrderById } from '../../../../_shared/orders.js';

export async function onRequest(context) {
  const { env, params, request } = context;
  try {
    const { id } = params || {};
    if (!id) return new Response(JSON.stringify({ success: false, error: 'id missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const body = await request.json().catch(() => ({}));
    const performedBy = body?.performedBy || null;

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    const ordRes = await db.prepare('SELECT id, status FROM "order" WHERE id = ?').bind(id).all();
    const ord = firstRow(ordRes);
    if (!ord) return new Response(JSON.stringify({ success: false, error: 'Order not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    const status = String(ord.status || '').toUpperCase();
    if (status === 'CANCELLED' || status === 'REFUNDED') return new Response(JSON.stringify({ success: false, error: 'Order already cancelled or refunded' }), { status: 409, headers: { 'Content-Type': 'application/json' } });

    // fetch items
    const itemsRes = await db.prepare('SELECT id, listingId, quantity FROM orderItem WHERE orderId = ?').bind(id).all();
    const items = Array.isArray(itemsRes?.results) ? itemsRes.results : (Array.isArray(itemsRes) ? itemsRes : []);

    // restore stock and create stock movements
    const now = new Date().toISOString();
    for (const it of items) {
      try {
        const listingId = it.listingId;
        const qty = Number(it.quantity || 0);
        await db.prepare('INSERT INTO stockMovement (id, listingId, warehouseId, fromWarehouseId, toWarehouseId, quantity, type, reference, performedBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind((globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `sm-${Date.now()}`, listingId, null, null, null, qty, 'IN', `order_cancel:${id}`, performedBy, now).run();
        await db.prepare('UPDATE listing SET quantity = quantity + ? WHERE id = ?').bind(qty, listingId).run();
      } catch (_) {}
    }

    await db.prepare('UPDATE "order" SET status = ?, updatedAt = ? WHERE id = ?').bind('CANCELLED', now, id).run();
    const updated = await getOrderById(db, id);
    return new Response(JSON.stringify({ success: true, order: updated }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
