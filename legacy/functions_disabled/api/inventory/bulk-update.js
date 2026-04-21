import { pickDb, ensureSchema } from '../../_shared/d1.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const updates = Array.isArray(body?.updates) ? body.updates : null;
    if (!updates || updates.length === 0) return json({ success: false, error: 'updates must be a non-empty array of { listingId, quantity }' }, 400);

    const db = pickDb(env);
    if (!db) return json({ success: false, error: 'No DB binding available' }, 500);
    await ensureSchema(db);

    const now = new Date().toISOString();
    const results = [];
    let updated = 0;
    for (const u of updates) {
      const listingId = u && u.listingId ? String(u.listingId).trim() : '';
      const quantity = Number.isFinite(Number(u?.quantity)) ? Number(u.quantity) : null;
      if (!listingId || quantity === null || !Number.isInteger(quantity) || quantity < 0) {
        results.push({ listingId: listingId || null, success: false, message: 'invalid update row' });
        continue;
      }

      const existsRes = await db.prepare('SELECT id FROM listing WHERE id = ?').bind(listingId).all();
      const existsRow = Array.isArray(existsRes?.results) ? existsRes.results[0] : (Array.isArray(existsRes) ? existsRes[0] : null);
      if (!existsRow) {
        results.push({ listingId, success: false, message: 'listing not found' });
        continue;
      }

      await db.prepare('UPDATE listing SET quantity = ?, everHadStock = CASE WHEN ? > 0 THEN 1 ELSE everHadStock END, updatedAt = ? WHERE id = ?')
        .bind(quantity, quantity, now, listingId).run();
      results.push({ listingId, success: true });
      updated++;
    }

    return json({ success: true, total: results.length, updated, failed: results.length - updated, results });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;
