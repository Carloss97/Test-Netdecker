import { pickDb, ensureSchema } from '../../../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const limit = Math.min(Number(params.limit) || 20, 200);
    const offset = Number(params.offset) || 0;

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    const rowsRes = await db.prepare('SELECT id, source, status, notes, total, updated, volatile, failed, roundingMultiple, errors, startedAt, completedAt, createdAt FROM priceSyncRun ORDER BY startedAt DESC LIMIT ? OFFSET ?')
      .bind(limit, offset).all();
    const rows = Array.isArray(rowsRes.results) ? rowsRes.results : (Array.isArray(rowsRes) ? rowsRes : []);
    return new Response(JSON.stringify({ success: true, runs: rows }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
