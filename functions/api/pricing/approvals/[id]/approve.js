import { pickDb, ensureSchema, firstRow } from '../../../../_shared/d1.js';
import priceService from '../../../../_shared/priceService.js';
import { resolveStoreFromRequest } from '../../../../_shared/tenant.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const id = params && (params.id || params.approvalId) ? String(params.id || params.approvalId) : (() => {
      const m = (request.url || '').match(/\/api\/pricing\/approvals\/([^\/]+)\/approve/);
      return m && m[1];
    })();

    if (!id) return json({ success: false, error: 'id required' }, 400);

    const db = pickDb(env);
    if (db) await ensureSchema(db);

    // ensure table exists
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
      } catch (_) {}
    }

    const store = await resolveStoreFromRequest(request, env);
    if (!store) return json({ success: false, error: 'Unauthorized' }, 401);
    if (!db) return json({ success: false, error: 'No DB binding' }, 500);

    const foundRes = await db.prepare('SELECT * FROM priceChangeApproval WHERE id = ? LIMIT 1').bind(id).all();
    const row = Array.isArray(foundRes?.results) ? foundRes.results[0] : (Array.isArray(foundRes) ? foundRes[0] : null);
    if (!row) return json({ success: false, error: 'Approval not found' }, 404);
    if ((String(row.status || '').toUpperCase()) !== 'PENDING') return json({ success: false, error: 'Approval already processed' }, 400);

    const body = await request.json().catch(() => ({}));
    const processedBy = typeof body.processedBy === 'string' ? String(body.processedBy) : undefined;

    try {
      // Apply lightweight listing update using priceService when possible
      if (row.listingId) {
        await priceService.updateListingPrice(db, env, String(row.listingId), Number(row.newReferencePrice || row.newReferencePrice), Number(row.marginMultiplier || 1), 'APPROVAL', processedBy || null, row.notes || null);
      }

      const now = new Date().toISOString();
      await db.prepare('UPDATE priceChangeApproval SET status = ?, processedBy = ?, processedAt = ?, updatedAt = ? WHERE id = ?')
        .bind('APPROVED', processedBy || null, now, now, id).run();

      const updatedRes = await db.prepare('SELECT id, listingId, oldFinalPrice, newFinalPrice, newReferencePrice, marginMultiplier, percentChange, status, requestedBy, processedBy, processedAt, notes, createdAt FROM priceChangeApproval WHERE id = ?').bind(id).all();
      const updated = Array.isArray(updatedRes?.results) ? updatedRes.results[0] : (Array.isArray(updatedRes) ? updatedRes[0] : null);
      return json({ success: true, approval: updated });
    } catch (err) {
      return json({ success: false, error: String(err) }, 500);
    }
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;
