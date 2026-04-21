import { pickDb, ensureSchema } from '../../_shared/d1.js';
import InvoiceShared from '../../_shared/invoice.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const { orderId } = body || {};
    if (!orderId) return new Response(JSON.stringify({ success: false, error: 'orderId required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);
    const invoice = await InvoiceShared.createInvoiceForOrder(db, orderId);
    return new Response(JSON.stringify({ success: true, invoice }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}
