import { pickDb, ensureSchema } from '../../../../_shared/d1.js';
import PosShared from '../../../../_shared/pos.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);
    const session = await PosShared.createSession(db, body);
    return new Response(JSON.stringify({ success: true, session }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}
