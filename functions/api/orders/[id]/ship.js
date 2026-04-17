import { pickDb, ensureSchema, firstRow } from '../../../../_shared/d1.js';
import { getOrderById } from '../../../../_shared/orders.js';

export async function onRequest(context) {
  const { env, params } = context;
  try {
    const { id } = params || {};
    if (!id) return new Response(JSON.stringify({ success: false, error: 'id missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    const ordRes = await db.prepare('SELECT id, status FROM "order" WHERE id = ?').bind(id).all();
    const ord = firstRow(ordRes);
    if (!ord) return new Response(JSON.stringify({ success: false, error: 'Order not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    const status = String(ord.status || '').toUpperCase();
    if (status === 'SHIPPED' || status === 'DELIVERED') return new Response(JSON.stringify({ success: false, error: 'Order already shipped or delivered' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    if (!['PENDING', 'CONFIRMED'].includes(status)) return new Response(JSON.stringify({ success: false, error: `Cannot ship order in status ${status}` }), { status: 409, headers: { 'Content-Type': 'application/json' } });

    const now = new Date().toISOString();
    await db.prepare('UPDATE "order" SET status = ?, updatedAt = ? WHERE id = ?').bind('SHIPPED', now, id).run();
    const updated = await getOrderById(db, id);
    return new Response(JSON.stringify({ success: true, order: updated }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
