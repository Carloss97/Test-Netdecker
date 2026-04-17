import { pickDb, ensureSchema } from '../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const token = env.ADMIN_MIGRATE_TOKEN || null;
    const header = request.headers.get('x-admin-token') || null;
    if (token && (!header || header !== token)) {
      return new Response(JSON.stringify({ success: false, error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'no-db' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    // run ensureSchema (idempotent) and then report table columns
    await ensureSchema(db);

    const tables = ['card','listing','edition','priceHistory','appConfig','priceSyncRun'];
    const info = {};
    for (const t of tables) {
      try {
        const res = await db.prepare(`PRAGMA table_info(${t});`).all();
        const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
        info[t] = rows.map((r) => (r && (r.name || r.NAME)) || Object.values(r)[1]);
      } catch (err) {
        info[t] = { error: String(err && err.message ? err.message : err) };
      }
    }

    return new Response(JSON.stringify({ success: true, tables: info }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
