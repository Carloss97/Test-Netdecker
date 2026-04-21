import { pickDb, ensureSchema } from '../../../../_shared/d1.js';
import { getOrderById } from '../../../../_shared/orders.js';

export async function onRequest(context) {
  const { env, params } = context;
  try {
    const { id } = params || {};
    if (!id) return new Response(JSON.stringify({ success: false, error: 'id missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);
    const order = await getOrderById(db, id);
    if (!order) return new Response(JSON.stringify({ success: false, error: 'Order not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    if (!order.receiptUrl) return new Response(JSON.stringify({ success: false, error: 'Receipt not available' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ success: true, receiptUrl: order.receiptUrl }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
