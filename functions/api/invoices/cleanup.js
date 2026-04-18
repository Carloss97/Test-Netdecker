import { pickDb, ensureSchema } from '../../_shared/d1.js';

export async function onRequest(context) {
  const { env } = context;
  try {
    if (env.ENABLE_INVOICE_CLEANUP_ENDPOINT !== 'true') return new Response(JSON.stringify({ success: false, error: 'Invoice cleanup endpoint disabled' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);
    // Simple cleanup: delete invoices older than 3 years (best-effort)
    const threshold = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString();
    const del = await db.prepare('DELETE FROM invoice WHERE createdAt < ?').bind(threshold).run();
    return new Response(JSON.stringify({ success: true, result: del }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
