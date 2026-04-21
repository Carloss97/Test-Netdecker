import { pickDb, ensureSchema } from '../../../../_shared/d1.js';
import { validateToken } from '../../../../_shared/adminAuth.js';

function extractToken(request) {
  const auth = request.headers.get('authorization') || '';
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return request.headers.get('x-admin-token') || '';
}

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const { id } = params || {};
    if (!id) return new Response(JSON.stringify({ success: false, error: 'id missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const token = extractToken(request);
    const user = await validateToken(env, token);
    if (!user) return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    if (request.method === 'GET') {
      const res = await db.prepare('SELECT id, code, name, address, metadata, createdAt, updatedAt FROM store WHERE id = ?').bind(id).all();
      const row = Array.isArray(res.results) ? res.results[0] : (Array.isArray(res) ? res[0] : null);
      if (!row) return new Response(JSON.stringify({ success: false, error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ success: true, store: row }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'PATCH') {
      const body = await request.json().catch(() => ({}));
      const parts = [];
      const binds = [];
      if (body.code !== undefined) { parts.push('code = ?'); binds.push(body.code); }
      if (body.name !== undefined) { parts.push('name = ?'); binds.push(body.name); }
      if (body.address !== undefined) { parts.push('address = ?'); binds.push(body.address); }
      if (body.metadata !== undefined) { parts.push('metadata = ?'); binds.push(typeof body.metadata === 'string' ? body.metadata : JSON.stringify(body.metadata)); }
      if (parts.length === 0) return new Response(JSON.stringify({ success: false, error: 'nothing_to_update' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      parts.push('updatedAt = ?'); binds.push(new Date().toISOString());
      binds.push(id);
      const sql = `UPDATE store SET ${parts.join(', ')} WHERE id = ?`;
      await db.prepare(sql).bind(...binds).run();
      const fres = await db.prepare('SELECT id, code, name, address, metadata, createdAt, updatedAt FROM store WHERE id = ?').bind(id).all();
      const row = Array.isArray(fres.results) ? fres.results[0] : (Array.isArray(fres) ? fres[0] : null);
      return new Response(JSON.stringify({ success: true, store: row }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'DELETE') {
      // remove store and associated listingStock rows
      await db.prepare('DELETE FROM listingStock WHERE storeId = ?').bind(id).run();
      await db.prepare('DELETE FROM store WHERE id = ?').bind(id).run();
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: false, error: 'method_not_allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export default onRequest;
