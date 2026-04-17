import { pickDb, ensureSchema } from '../../../../_shared/d1.js';
import CartShared from '../../../../_shared/cart.js';

export async function onRequest(context) {
  const { env, params } = context;
  try {
    const { sessionId } = params || {};
    if (!sessionId) return new Response(JSON.stringify({ success: false, error: 'sessionId missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);
    const cart = await CartShared.getOrCreateCart(db, sessionId);
    return new Response(JSON.stringify(cart), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
