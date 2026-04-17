import { pickDb, ensureSchema } from '../../_shared/d1.js';
import OrdersShared from '../../_shared/orders.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    const created = await OrdersShared.processPosSale(db, body);
    return new Response(JSON.stringify({ success: true, order: created }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}
