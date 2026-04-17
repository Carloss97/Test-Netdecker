import { pickDb, ensureSchema } from '../../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    if (request.method !== 'POST') return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type':'application/json' } });

    const url = new URL(request.url);
    const qKey = url.searchParams.get('key');
    let body = {};
    try { body = await request.json().catch(() => ({})); } catch (_) { body = {}; }
    const key = String(body.key || qKey || '').trim();
    if (!key) return new Response(JSON.stringify({ success: false, error: 'key query param or body.key required' }), { status: 400, headers: { 'Content-Type':'application/json' } });

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB bound' }), { status: 500, headers: { 'Content-Type':'application/json' } });
    await ensureSchema(db);

    if (key === '*' || key === '%') {
      await db.prepare('DELETE FROM appConfig').run();
      return new Response(JSON.stringify({ success: true, invalidated: 'all' }), { status: 200, headers: { 'Content-Type':'application/json' } });
    }

    if (key.endsWith('*')) {
      const prefix = key.slice(0, -1);
      await db.prepare('DELETE FROM appConfig WHERE key LIKE ?').bind(prefix + '%').run();
      return new Response(JSON.stringify({ success: true, invalidated: prefix + '%' }), { status: 200, headers: { 'Content-Type':'application/json' } });
    }

    await db.prepare('DELETE FROM appConfig WHERE key = ?').bind(key).run();
    return new Response(JSON.stringify({ success: true, invalidated: key }), { status: 200, headers: { 'Content-Type':'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type':'application/json' } });
  }
}
