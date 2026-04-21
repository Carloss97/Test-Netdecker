import { pickDb, ensureSchema, firstRow } from '../../../_shared/d1.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const db = pickDb(env);
    if (!db) return json({ success: false, error: 'No DB binding available' }, 500);
    await ensureSchema(db);

    const body = await request.json().catch(() => ({}));
    const listingId = body?.listingId;
    const warehouseId = body?.warehouseId || null;

    if (!listingId) return json({ success: false, error: 'listingId is required' }, 400);

    const listingRes = await db.prepare('SELECT id, quantity FROM listing WHERE id = ?').bind(listingId).all();
    const listing = firstRow(listingRes);
    if (!listing) return json({ success: false, error: 'Listing not found' }, 404);

    const id = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `snap-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const takenAt = new Date().toISOString();

    await db.prepare('INSERT INTO stockSnapshot (id, listingId, warehouseId, quantity, takenAt, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, listingId, warehouseId, Number(listing.quantity || 0), takenAt, takenAt).run();

    return json({ success: true, snapshot: { id, listingId, warehouseId, quantity: Number(listing.quantity || 0), takenAt } });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;
