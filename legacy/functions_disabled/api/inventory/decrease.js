import { pickDb, ensureSchema } from '../../_shared/d1.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const listingId = body && body.listingId ? String(body.listingId).trim() : '';
    const amount = Number.isFinite(Number(body?.amount)) ? Number(body.amount) : null;

    if (!listingId) return json({ success: false, error: 'listingId is required' }, 400);
    if (amount === null || !Number.isInteger(amount) || amount <= 0) return json({ success: false, error: 'amount must be a positive integer' }, 400);

    const db = pickDb(env);
    if (!db) return json({ success: false, error: 'No DB binding available' }, 500);
    await ensureSchema(db);

    const curRes = await db.prepare('SELECT quantity FROM listing WHERE id = ?').bind(listingId).all();
    const curRow = Array.isArray(curRes?.results) ? curRes.results[0] : (Array.isArray(curRes) ? curRes[0] : null);
    if (!curRow) return json({ success: false, error: 'Listing not found' }, 404);

    const current = Number(curRow.quantity || 0);
    if (current < amount) return json({ success: false, error: 'Insufficient stock' }, 409);

    const newQty = Math.max(0, current - amount);
    const now = new Date().toISOString();
    await db.prepare('UPDATE listing SET quantity = ?, updatedAt = ? WHERE id = ?').bind(newQty, now, listingId).run();

    return json({ success: true, listingId, quantity: newQty });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;
