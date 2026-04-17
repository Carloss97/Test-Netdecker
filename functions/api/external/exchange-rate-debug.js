import { pickDb, ensureSchema, firstRow } from '../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env } = context;
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }

    if (request.method !== 'GET') return json({ success: false, error: 'Method not allowed' }, 405);

    const db = pickDb(env);
    if (!db) return json({ success: false, error: 'No DB binding available' }, 500);
    await ensureSchema(db);

    const res = await db.prepare('SELECT value FROM appConfig WHERE key = ?').bind('exchangeRateLastError').all();
    const row = firstRow(res);
    if (!row || !row.value) return json({ success: true, found: false });

    try {
      const parsed = JSON.parse(row.value);
      return json({ success: true, found: true, lastError: parsed });
    } catch (err) {
      return json({ success: true, found: true, lastErrorRaw: row.value });
    }
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}
