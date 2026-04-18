import { pickDb, ensureSchema } from '../../_shared/d1.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const listingId = body && body.listingId ? String(body.listingId).trim() : '';
    const quantity = Number.isFinite(Number(body?.quantity)) ? Number(body.quantity) : null;

    if (!listingId) return json({ success: false, error: 'listingId is required' }, 400);
    if (quantity === null || !Number.isInteger(quantity) || quantity < 0) return json({ success: false, error: 'quantity must be an integer >= 0' }, 400);

    const db = pickDb(env);
    if (!db) return json({ success: false, error: 'No DB binding available' }, 500);
    await ensureSchema(db);

    const existsRes = await db.prepare('SELECT id FROM listing WHERE id = ?').bind(listingId).all();
    const existsRow = Array.isArray(existsRes?.results) ? existsRes.results[0] : (Array.isArray(existsRes) ? existsRes[0] : null);
    if (!existsRow) return json({ success: false, error: 'Listing not found' }, 404);

    const now = new Date().toISOString();
    await db.prepare('UPDATE listing SET quantity = ?, everHadStock = CASE WHEN ? > 0 THEN 1 ELSE everHadStock END, updatedAt = ? WHERE id = ?')
      .bind(quantity, quantity, now, listingId).run();

    return json({ success: true, listingId, quantity });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;
