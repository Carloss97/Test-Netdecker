import { pickDb, ensureSchema, firstRow } from '../../../_shared/d1.js';
import { validateToken } from '../../../_shared/adminAuth.js';

function extractToken(request) {
  const auth = request.headers.get('authorization') || '';
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return request.headers.get('x-admin-token') || '';
}

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const token = extractToken(request);
    const user = await validateToken(env, token);
    if (!user) return json({ success: false, error: 'Unauthorized' }, 401);

    const db = pickDb(env);
    if (db) await ensureSchema(db);

    if (request.method === 'GET') {
      if (!db) return json({ success: true, stores: [] });
      const res = await db.prepare('SELECT id, code, name, address, metadata, createdAt, updatedAt FROM store ORDER BY name ASC').all();
      const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
      return json({ success: true, stores: rows });
    }

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const code = (body.code || '').toString().trim();
      const name = (body.name || '').toString().trim();
      const address = (body.address || '').toString().trim();
      const metadata = body.metadata ? JSON.stringify(body.metadata) : null;
      if (!name) return json({ success: false, error: 'name required' }, 400);
      const id = (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : `store-${Date.now()}`;
      const now = new Date().toISOString();
      if (db) {
        try {
          await db.prepare('INSERT INTO store (id, code, name, address, metadata, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .bind(id, code || null, name, address || null, metadata, now, now).run();
        } catch (err) {
          return json({ success: false, error: String(err) }, 500);
        }
      }
      return json({ success: true, store: { id, code, name, address, metadata, createdAt: now, updatedAt: now } }, 201);
    }

    return json({ success: false, error: 'Method not allowed' }, 405);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}
