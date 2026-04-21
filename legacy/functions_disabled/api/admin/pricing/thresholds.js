import { pickDb, ensureSchema } from '../../../_shared/d1.js';
import { resolveStoreFromRequest } from '../../../_shared/tenant.js';

// Note: path above is intended to resolve to functions/_shared/d1.js in Pages.
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

    // GET /api/admin/pricing/thresholds?tcg=...&editionId=...
    if (method === 'GET' && path.endsWith('/api/admin/pricing/thresholds')) {
      if (!db) return json({ success: false, error: 'No DB binding' }, 500);
      const tcg = url.searchParams.get('tcg') || null;
      const editionId = url.searchParams.get('editionId') || null;
      const binds = [];
      let sql = 'SELECT id, tcg, editionId, thresholdPercent, createdAt FROM priceVolatilityThreshold';
      const where = [];
      if (tcg) { where.push('tcg = ?'); binds.push(tcg); }
      if (editionId) { where.push('editionId = ?'); binds.push(editionId); }
      if (where.length) sql += ' WHERE ' + where.join(' AND ');
      sql += ' ORDER BY createdAt DESC';
      const res = await db.prepare(sql).bind(...binds).all();
      const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
      return json({ success: true, total: rows.length, thresholds: rows });
    }

    // POST /api/admin/pricing/thresholds
    if (method === 'POST' && path.endsWith('/api/admin/pricing/thresholds')) {
      if (!db) return json({ success: false, error: 'No DB binding' }, 500);
      const body = await request.json().catch(() => ({}));
      const { tcg, editionId, thresholdPercent } = body || {};
      if (typeof thresholdPercent !== 'number' || !Number.isFinite(thresholdPercent) || thresholdPercent <= 0) return json({ success: false, error: 'thresholdPercent must be a positive number' }, 400);
      const id = `thr-${Date.now()}-${Math.floor(Math.random()*10000)}`;
      const now = new Date().toISOString();
      try {
        await db.prepare('INSERT INTO priceVolatilityThreshold (id, tcg, editionId, thresholdPercent, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(id, tcg || null, editionId || null, thresholdPercent, now, now).run();
        return json({ success: true, threshold: { id, tcg: tcg || null, editionId: editionId || null, thresholdPercent, createdAt: now } });
      } catch (err) {
        return json({ success: false, error: 'Create failed' }, 500);
      }
    }

    // PATCH /api/admin/pricing/thresholds/:id
    if ((method === 'PATCH' || method === 'PUT') && path.match(/\/api\/admin\/pricing\/thresholds\/[^\/]+$/)) {
      if (!db) return json({ success: false, error: 'No DB binding' }, 500);
      const m = path.match(/\/api\/admin\/pricing\/thresholds\/([^\/]+)$/);
      const id = m && m[1];
      if (!id) return json({ success: false, error: 'id required' }, 400);
      const body = await request.json().catch(() => ({}));
      const { tcg, editionId, thresholdPercent } = body || {};
      const updates = [];
      const binds = [];
      if (tcg !== undefined) { updates.push('tcg = ?'); binds.push(tcg || null); }
      if (editionId !== undefined) { updates.push('editionId = ?'); binds.push(editionId || null); }
      if (thresholdPercent !== undefined) {
        if (typeof thresholdPercent !== 'number' || !Number.isFinite(thresholdPercent) || thresholdPercent <= 0) return json({ success: false, error: 'thresholdPercent must be a positive number' }, 400);
        updates.push('thresholdPercent = ?'); binds.push(thresholdPercent);
      }
      if (updates.length === 0) return json({ success: false, error: 'no updates' }, 400);
      binds.push(new Date().toISOString()); binds.push(id);
      const sql = `UPDATE priceVolatilityThreshold SET ${updates.join(', ')}, updatedAt = ? WHERE id = ?`;
      try {
        await db.prepare(sql).bind(...binds).run();
        return json({ success: true });
      } catch (err) {
        return json({ success: false, error: 'update failed' }, 500);
      }
    }

    // DELETE /api/admin/pricing/thresholds/:id
    if (method === 'DELETE' && path.match(/\/api\/admin\/pricing\/thresholds\/[^\/]+$/)) {
      if (!db) return json({ success: false, error: 'No DB binding' }, 500);
      const m = path.match(/\/api\/admin\/pricing\/thresholds\/([^\/]+)$/);
      const id = m && m[1];
      if (!id) return json({ success: false, error: 'id required' }, 400);
      try {
        await db.prepare('DELETE FROM priceVolatilityThreshold WHERE id = ?').bind(id).run();
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
