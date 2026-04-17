import { pickDb, ensureSchema, firstRow } from '../../../_shared/d1.js';

export async function onRequest(context) {
  const { env, params } = context;
  try {
    const { id } = params || {};
    if (!id) return new Response(JSON.stringify({ success: false, error: 'id missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);
    const res = await db.prepare('SELECT pdfUrl FROM invoice WHERE id = ?').bind(id).all();
    const inv = firstRow(res);
    if (!inv || !inv.pdfUrl) return new Response(JSON.stringify({ success: false, error: 'PDF not available' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ success: true, pdfUrl: inv.pdfUrl }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
