import { pickDb } from '../_shared/d1.js';

export async function onRequest(context) {
  const { request, env } = context;
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }

    const out = { success: true, timestamp: new Date().toISOString() };
    const db = pickDb(env);
    if (db) {
      try {
        // quick lightweight check: list one table name if available
        const res = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' LIMIT 1;").all();
        const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
        out.db = { ok: true, sampleTable: rows.length ? (rows[0].name || rows[0].NAME || null) : null };
      } catch (e) {
        out.db = { ok: false, error: String(e) };
      }
    } else {
      out.db = { ok: false, available: false };
    }

    return json(out);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}
