import { pickDb, ensureSchema } from '../../../../../_shared/d1.js';
import PosShared from '../../../../../_shared/pos.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const { sessionId } = params || {};
    if (!sessionId) return new Response(JSON.stringify({ success: false, error: 'sessionId missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const tx = await PosShared.createTransaction(db, sessionId, body);
      return new Response(JSON.stringify({ success: true, transaction: tx }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'GET') {
      const txs = await PosShared.listTransactions(db, sessionId);
      return new Response(JSON.stringify({ success: true, transactions: txs }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}
