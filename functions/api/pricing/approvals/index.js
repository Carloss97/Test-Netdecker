import { pickDb, ensureSchema } from '../../../_shared/d1.js';
import { resolveStoreFromRequest } from '../../../_shared/tenant.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const db = pickDb(env);
    if (db) await ensureSchema(db);

    // Ensure approval table exists
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

    const store = await resolveStoreFromRequest(request, env);
    if (!store) return json({ success: false, error: 'Unauthorized' }, 401);

    if (!db) return json({ success: false, error: 'No DB binding' }, 500);

    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 200);
    const res = await db.prepare('SELECT id, listingId, oldFinalPrice, newFinalPrice, newReferencePrice, marginMultiplier, percentChange, status, requestedBy, processedBy, processedAt, notes, createdAt FROM priceChangeApproval WHERE status = ? ORDER BY createdAt ASC LIMIT ?').bind('PENDING', limit).all();
    const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
    return json({ success: true, total: rows.length, approvals: rows });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;
