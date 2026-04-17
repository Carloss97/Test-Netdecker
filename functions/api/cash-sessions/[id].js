import { pickDb, ensureSchema } from '../../../../_shared/d1.js';
import CashShared from '../../../../_shared/cash.js';

export async function onRequest(context) {
  const { env, params } = context;
  try {
    const { id } = params || {};
    if (!id) return new Response(JSON.stringify({ success: false, error: 'id missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);
    const session = await CashShared.getSessionById(db, id);
    return new Response(JSON.stringify({ success: true, session }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}
