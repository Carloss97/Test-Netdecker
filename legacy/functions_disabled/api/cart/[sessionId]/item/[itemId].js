import { pickDb, ensureSchema } from '../../../../../_shared/d1.js';
import CartShared from '../../../../../_shared/cart.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const { sessionId, itemId } = params || {};
    if (!sessionId || !itemId) return new Response(JSON.stringify({ success: false, error: 'missing params' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    if (request.method === 'PATCH') {
      const body = await request.json().catch(() => ({}));
      const { quantity } = body || {};
      if (quantity === undefined) return new Response(JSON.stringify({ success: false, error: 'quantity is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      const cart = await CartShared.updateItemQuantity(db, sessionId, itemId, Number(quantity));
      return new Response(JSON.stringify(cart), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'DELETE') {
      const cart = await CartShared.removeFromCart(db, sessionId, itemId);
      return new Response(JSON.stringify(cart), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}
