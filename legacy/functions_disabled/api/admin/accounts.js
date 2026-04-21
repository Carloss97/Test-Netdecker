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
    const store = await resolveStoreFromRequest(request, env);
    if (!store) return json({ success: false, error: 'Unauthorized' }, 401);

    // GET /api/admin/accounts?storeId=...
    if (method === 'GET' && path.endsWith('/api/admin/accounts')) {
      if (!db) return json({ success: false, error: 'No DB binding' }, 500);
      const storeId = url.searchParams.get('storeId') || null;
      let sql = 'SELECT id, storeId, code, name, type, description, createdAt FROM account';
      const binds = [];
      if (storeId) { sql += ' WHERE storeId = ?'; binds.push(storeId); }
      sql += ' ORDER BY code ASC';
      const res = await db.prepare(sql).bind(...binds).all();
      const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
      return json({ success: true, total: rows.length, accounts: rows });
    }

    // POST /api/admin/accounts
    if (method === 'POST' && path.endsWith('/api/admin/accounts')) {
      if (!db) return json({ success: false, error: 'No DB binding' }, 500);
      const body = await request.json().catch(() => ({}));
      const { storeId, code, name, type, description } = body || {};
      if (!code || !name || !type) return json({ success: false, error: 'code, name and type are required' }, 400);
      const allowed = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
      if (!allowed.includes(type)) return json({ success: false, error: 'Invalid account type' }, 400);

      const id = `acc-${Date.now()}-${Math.floor(Math.random()*10000)}`;
      const now = new Date().toISOString();
      try {
        await db.prepare('INSERT INTO account (id, storeId, code, name, type, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(id, storeId || null, String(code).trim(), String(name).trim(), String(type), description || null, now, now).run();
      } catch (err) {
        return json({ success: false, error: 'Create failed' }, 500);
      }
      return json({ success: true, account: { id, storeId: storeId || null, code: String(code).trim(), name: String(name).trim(), type: String(type), description: description || null, createdAt: now } });
    }

    // PATCH /api/admin/accounts/:id
    if ((method === 'PATCH' || method === 'PUT') && path.match(/\/api\/admin\/accounts\/[^\/]+$/)) {
      if (!db) return json({ success: false, error: 'No DB binding' }, 500);
      const m = path.match(/\/api\/admin\/accounts\/([^\/]+)$/);
      const id = m && m[1];
      if (!id) return json({ success: false, error: 'account id required' }, 400);
      const body = await request.json().catch(() => ({}));
      const { storeId, code, name, type, description } = body || {};
      const allowed = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
      if (type && !allowed.includes(type)) return json({ success: false, error: 'Invalid account type' }, 400);

      const updates = [];
      const binds = [];
      if (storeId !== undefined) { updates.push('storeId = ?'); binds.push(storeId || null); }
      if (code !== undefined) { updates.push('code = ?'); binds.push(String(code).trim()); }
      if (name !== undefined) { updates.push('name = ?'); binds.push(String(name).trim()); }
      if (type !== undefined) { updates.push('type = ?'); binds.push(String(type)); }
      if (description !== undefined) { updates.push('description = ?'); binds.push(description || null); }
      if (updates.length === 0) return json({ success: false, error: 'no updates' }, 400);
      binds.push(new Date().toISOString()); binds.push(id);
      const sql = `UPDATE account SET ${updates.join(', ')}, updatedAt = ? WHERE id = ?`;
      try {
        await db.prepare(sql).bind(...binds).run();
        return json({ success: true });
      } catch (err) {
        return json({ success: false, error: 'update failed' }, 500);
      }
    }

    // DELETE /api/admin/accounts/:id
    if (method === 'DELETE' && path.match(/\/api\/admin\/accounts\/[^\/]+$/)) {
      if (!db) return json({ success: false, error: 'No DB binding' }, 500);
      const m = path.match(/\/api\/admin\/accounts\/([^\/]+)$/);
      const id = m && m[1];
      if (!id) return json({ success: false, error: 'account id required' }, 400);
      try {
        const usedRes = await db.prepare('SELECT id FROM journalLine WHERE accountId = ? LIMIT 1').bind(id).all();
        const usedRow = Array.isArray(usedRes?.results) ? usedRes.results[0] : (Array.isArray(usedRes) ? usedRes[0] : null);
        if (usedRow) return json({ success: false, error: 'Account is used in journal entries and cannot be deleted' }, 400);
        await db.prepare('DELETE FROM account WHERE id = ?').bind(id).run();
        return json({ success: true });
      } catch (err) {
        return json({ success: false, error: 'delete failed' }, 500);
      }
    }

    return json({ success: false, error: 'Not found' }, 404);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}
