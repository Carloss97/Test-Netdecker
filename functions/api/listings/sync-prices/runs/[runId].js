import { pickDb, ensureSchema } from '../../../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const { runId } = params || {};
    if (!runId) return new Response(JSON.stringify({ success: false, error: 'runId missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    const rowRes = await db.prepare('SELECT id, source, status, notes, total, updated, volatile, failed, roundingMultiple, errors, startedAt, completedAt, createdAt FROM priceSyncRun WHERE id = ?').bind(runId).all();
    const row = Array.isArray(rowRes.results) ? rowRes.results[0] : (Array.isArray(rowRes) ? rowRes[0] : null);
    if (!row) return new Response(JSON.stringify({ success: false, error: 'Run not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    // fetch related history
    const historyRes = await db.prepare('SELECT id, listingId, oldPrice, newPrice, oldReferencePrice, newReferencePrice, reason, percentChange, changedBy, notes, createdAt FROM priceHistory WHERE createdAt >= ? ORDER BY createdAt DESC LIMIT 1000')
      .bind(row.startedAt || '1970-01-01T00:00:00.000Z').all();
    const history = Array.isArray(historyRes.results) ? historyRes.results : (Array.isArray(historyRes) ? historyRes : []);

    return new Response(JSON.stringify({ success: true, run: row, history }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
