import { pickDb, ensureSchema } from '../../../../_shared/d1.js';
import CartShared from '../../../../_shared/cart.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const { sessionId } = params || {};
    if (!sessionId) return new Response(JSON.stringify({ success: false, error: 'sessionId missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const body = await request.json().catch(() => ({}));
    const { customerEmail, shippingAddress, notes } = body || {};
    if (!customerEmail) return new Response(JSON.stringify({ success: false, error: 'customerEmail is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);
    const order = await CartShared.checkout(db, sessionId, customerEmail, shippingAddress, notes);
    return new Response(JSON.stringify({ success: true, order }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}
