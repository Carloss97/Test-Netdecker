import { pickDb, ensureSchema } from '../../_shared/d1.js';
import { resolveStoreFromRequest } from '../../_shared/tenant.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = pickDb(env);
  if (db) await ensureSchema(db);

  // Ensure approval table exists in D1
  if (db) {
    try {
      await db.prepare(`CREATE TABLE IF NOT EXISTS priceChangeApproval (
        id TEXT PRIMARY KEY,
        listingId TEXT,
        oldFinalPrice REAL,
        newFinalPrice REAL,
        newReferencePrice REAL,
        marginMultiplier REAL,
        percentChange REAL,
        status TEXT DEFAULT 'PENDING',
        requestedBy TEXT,
        processedBy TEXT,
        processedAt TEXT,
        notes TEXT,
        createdAt TEXT,
        updatedAt TEXT
      );`).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_priceChangeApproval_status ON priceChangeApproval(status);').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_priceChangeApproval_listing ON priceChangeApproval(listingId);').run();
    } catch (_) {}
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+?/g, '/').replace(/\/$/, '');
  const method = request.method.toUpperCase();

  try {
    const store = await resolveStoreFromRequest(request, env);
    if (!store) return json({ success: false, error: 'Unauthorized' }, 401);

    // GET /api/admin/approvals/pending
    if (method === 'GET' && path.endsWith('/api/admin/approvals/pending')) {
      if (!db) return json({ success: false, error: 'No DB binding' }, 500);
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 200);
      const res = await db.prepare('SELECT id, listingId, oldFinalPrice, newFinalPrice, newReferencePrice, marginMultiplier, percentChange, status, requestedBy, processedBy, processedAt, notes, createdAt FROM priceChangeApproval WHERE status = ? ORDER BY createdAt ASC LIMIT ?').bind('PENDING', limit).all();
      const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
      return json({ success: true, total: rows.length, approvals: rows });
    }

    // POST /api/admin/approvals/:id/approve
    if (method === 'POST' && path.match(/\/api\/admin\/approvals\/[^\/]+\/approve$/)) {
      if (!db) return json({ success: false, error: 'No DB binding' }, 500);
      const m = path.match(/\/api\/admin\/approvals\/([^\/]+)\/approve$/);
      const id = m && m[1];
      if (!id) return json({ success: false, error: 'id required' }, 400);
      const body = await request.json().catch(() => ({}));
      const processedBy = typeof body.processedBy === 'string' ? String(body.processedBy) : undefined;

      const found = await db.prepare('SELECT * FROM priceChangeApproval WHERE id = ? LIMIT 1').bind(id).all();
      const row = Array.isArray(found?.results) ? found.results[0] : (Array.isArray(found) ? found[0] : null);
      if (!row) return json({ success: false, error: 'Approval not found' }, 404);
      if ((row.status || row.STATUS || '').toUpperCase() !== 'PENDING') return json({ success: false, error: 'Approval already processed' }, 400);

      // Try to apply a lightweight listing update + priceHistory entry (best-effort)
      try {
        const now = new Date().toISOString();
        if (row.listingId) {
          // update listing referencePrice/margin (best-effort)
          await db.prepare('UPDATE listing SET referencePrice = ?, marginMultiplier = ?, updatedAt = ? WHERE id = ?')
            .bind(row.newReferencePrice || null, row.marginMultiplier || null, now, row.listingId).run().catch(() => {});

          // insert priceHistory record
          const phId = `ph-${Date.now()}-${Math.floor(Math.random()*10000)}`;
          await db.prepare('INSERT INTO priceHistory (id, listingId, oldPrice, newPrice, oldReferencePrice, newReferencePrice, reason, percentChange, changedBy, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(phId, row.listingId, row.oldFinalPrice ?? null, row.newFinalPrice ?? null, null, row.newReferencePrice ?? null, 'APPROVAL', row.percentChange ?? null, processedBy || null, row.notes || null, now).run().catch(() => {});
        }

        // mark approval as approved
        const now2 = new Date().toISOString();
        await db.prepare('UPDATE priceChangeApproval SET status = ?, processedBy = ?, processedAt = ?, updatedAt = ? WHERE id = ?')
          .bind('APPROVED', processedBy || null, now2, now2, id).run();

        const updatedRes = await db.prepare('SELECT id, listingId, oldFinalPrice, newFinalPrice, newReferencePrice, marginMultiplier, percentChange, status, requestedBy, processedBy, processedAt, notes, createdAt FROM priceChangeApproval WHERE id = ?').bind(id).all();
        const updated = Array.isArray(updatedRes?.results) ? updatedRes.results[0] : (Array.isArray(updatedRes) ? updatedRes[0] : null);
        return json({ success: true, approval: updated });
      } catch (err) {
        return json({ success: false, error: String(err) }, 500);
      }
    }

    // POST /api/admin/approvals/:id/reject
    if (method === 'POST' && path.match(/\/api\/admin\/approvals\/[^\/]+\/reject$/)) {
      if (!db) return json({ success: false, error: 'No DB binding' }, 500);
      const m = path.match(/\/api\/admin\/approvals\/([^\/]+)\/reject$/);
      const id = m && m[1];
      if (!id) return json({ success: false, error: 'id required' }, 400);
      const body = await request.json().catch(() => ({}));
      const processedBy = typeof body.processedBy === 'string' ? String(body.processedBy) : undefined;
      const notes = typeof body.reason === 'string' ? String(body.reason) : (typeof body.notes === 'string' ? String(body.notes) : undefined);

      const found = await db.prepare('SELECT * FROM priceChangeApproval WHERE id = ? LIMIT 1').bind(id).all();
      const row = Array.isArray(found?.results) ? found.results[0] : (Array.isArray(found) ? found[0] : null);
      if (!row) return json({ success: false, error: 'Approval not found' }, 404);
      if ((row.status || row.STATUS || '').toUpperCase() !== 'PENDING') return json({ success: false, error: 'Approval already processed' }, 400);

      try {
        const now = new Date().toISOString();
        await db.prepare('UPDATE priceChangeApproval SET status = ?, processedBy = ?, processedAt = ?, notes = ?, updatedAt = ? WHERE id = ?')
          .bind('REJECTED', processedBy || null, now, notes || null, now, id).run();
        const updatedRes = await db.prepare('SELECT id, listingId, oldFinalPrice, newFinalPrice, newReferencePrice, marginMultiplier, percentChange, status, requestedBy, processedBy, processedAt, notes, createdAt FROM priceChangeApproval WHERE id = ?').bind(id).all();
        const updated = Array.isArray(updatedRes?.results) ? updatedRes.results[0] : (Array.isArray(updatedRes) ? updatedRes[0] : null);
        return json({ success: true, approval: updated });
      } catch (err) {
        return json({ success: false, error: String(err) }, 500);
      }
    }

    return json({ success: false, error: 'Not found' }, 404);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}
