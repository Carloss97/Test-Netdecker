import { pickDb, ensureSchema } from '../../_shared/d1.js';
import { resolveStoreFromRequest } from '../../_shared/tenant.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = pickDb(env);
  if (db) await ensureSchema(db);

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+?/g, '/').replace(/\/$/, '');
  const method = request.method.toUpperCase();

  try {
    // Basic auth: require store-admin via x-api-key matching store apiKeyHash
    const store = await resolveStoreFromRequest(request, env);

    // Only allow admin operations if a store resolved; this is intentionally simple.
    if (!store) return json({ success: false, error: 'Unauthorized' }, 401);

    // Routes:
    // GET /api/admin/stores -> list stores
    // POST /api/admin/stores -> create store (body: { slug, name, description, currency, taxRate })
    // POST /api/admin/stores/:id/rotate -> rotate api key
    // PATCH /api/admin/stores/:id -> update store

    if (method === 'GET' && path.endsWith('/api/admin/stores')) {
      if (!db) return json({ success: false, error: 'No DB binding' }, 500);
      const res = await db.prepare('SELECT id, slug, name, currency, taxRate, settings, createdAt FROM store ORDER BY createdAt DESC').all();
      const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
      return json({ success: true, stores: rows });
    }

    if (method === 'POST' && path.endsWith('/api/admin/stores')) {
      if (!db) return json({ success: false, error: 'No DB binding' }, 500);
      const body = await request.json().catch(() => ({}));
      const slug = String(body.slug || '').trim().toLowerCase();
      const name = String(body.name || '').trim();
      if (!slug || !name) return json({ success: false, error: 'slug and name required' }, 400);
      // generate apiKey and hash (simple fallback when crypto unavailable)
      let apiKey = null;
      let apiKeyHash = null;
      try {
        apiKey = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `key-${Date.now()}-${Math.floor(Math.random()*10000)}`;
        const nodeCrypto = await import('crypto').then(m => m.default || m).catch(() => null);
        if (nodeCrypto && nodeCrypto.randomBytes) apiKey = nodeCrypto.randomBytes(24).toString('hex');
        // simple scrypt style: salt:hex
        if (nodeCrypto && nodeCrypto.scryptSync) {
          const salt = (nodeCrypto.randomBytes(16).toString('hex'));
          const derived = nodeCrypto.scryptSync(apiKey, salt, 64);
          apiKeyHash = `${salt}:${derived.toString('hex')}`;
        } else {
          apiKeyHash = apiKey;
        }
      } catch (_) { apiKey = apiKey || `key-${Date.now()}`; apiKeyHash = apiKey; }

      const now = new Date().toISOString();
      try {
        await db.prepare('INSERT INTO store (id, slug, name, description, currency, taxRate, settings, apiKeyHash, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(`store-${Date.now()}-${Math.floor(Math.random()*10000)}`, slug, name, body.description || null, body.currency || null, body.taxRate ?? null, body.settings ? JSON.stringify(body.settings) : null, apiKeyHash, now, now).run();
      } catch (err) {
        return json({ success: false, error: 'Create failed' }, 500);
      }
      return json({ success: true, store: { slug, name }, apiKey });
    }

    // rotate api key
    if (method === 'POST' && path.match(/\/api\/admin\/stores\/[^\/]+\/rotate$/)) {
      if (!db) return json({ success: false, error: 'No DB binding' }, 500);
      const m = path.match(/\/api\/admin\/stores\/([^\/]+)\/rotate$/);
      const storeId = m && m[1];
      if (!storeId) return json({ success: false, error: 'store id required' }, 400);
      // generate new key
      let apiKey = null; let apiKeyHash = null;
      try {
        const nodeCrypto = await import('crypto').then(m => m.default || m).catch(() => null);
        apiKey = (nodeCrypto && nodeCrypto.randomBytes) ? nodeCrypto.randomBytes(24).toString('hex') : `key-${Date.now()}`;
        if (nodeCrypto && nodeCrypto.scryptSync) {
          const salt = (nodeCrypto.randomBytes(16).toString('hex'));
          const derived = nodeCrypto.scryptSync(apiKey, salt, 64);
          apiKeyHash = `${salt}:${derived.toString('hex')}`;
        } else apiKeyHash = apiKey;
      } catch (_) { apiKey = apiKey || `key-${Date.now()}`; apiKeyHash = apiKey; }

      try {
        await db.prepare('UPDATE store SET apiKeyHash = ?, updatedAt = ? WHERE id = ?').bind(apiKeyHash, new Date().toISOString(), storeId).run();
        return json({ success: true, apiKey });
      } catch (err) {
        return json({ success: false, error: 'rotate failed' }, 500);
      }
    }

    // update store
    if ((method === 'PATCH' || method === 'PUT') && path.match(/\/api\/admin\/stores\/[^\/]+$/)) {
      if (!db) return json({ success: false, error: 'No DB binding' }, 500);
      const m = path.match(/\/api\/admin\/stores\/([^\/]+)$/);
      const storeId = m && m[1];
      if (!storeId) return json({ success: false, error: 'store id required' }, 400);
      const body = await request.json().catch(() => ({}));
      const updates = [];
      const binds = [];
      if (body.name !== undefined) { updates.push('name = ?'); binds.push(body.name); }
      if (body.description !== undefined) { updates.push('description = ?'); binds.push(body.description); }
      if (body.currency !== undefined) { updates.push('currency = ?'); binds.push(body.currency); }
      if (body.taxRate !== undefined) { updates.push('taxRate = ?'); binds.push(body.taxRate); }
      if (body.settings !== undefined) { updates.push('settings = ?'); binds.push(typeof body.settings === 'string' ? body.settings : JSON.stringify(body.settings)); }
      if (updates.length === 0) return json({ success: false, error: 'no updates' }, 400);
      binds.push(new Date().toISOString()); binds.push(storeId);
      const sql = `UPDATE store SET ${updates.join(', ')}, updatedAt = ? WHERE id = ?`;
      try {
        await db.prepare(sql).bind(...binds).run();
        return json({ success: true });
      } catch (err) {
        return json({ success: false, error: 'update failed' }, 500);
      }
    }

    return json({ success: false, error: 'Not found' }, 404);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}
