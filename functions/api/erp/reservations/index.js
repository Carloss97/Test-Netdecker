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

    if (request.method === 'GET') {
      const res = await db.prepare('SELECT id, listingId, warehouseId, quantity, reservedBy, expiresAt, status, createdAt, updatedAt FROM reservation ORDER BY createdAt DESC LIMIT 50').all();
      const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
      return json({ success: true, items: rows });
    }

    // POST -> create reservation
    const body = await request.json().catch(() => ({}));
    const listingId = body?.listingId;
    const quantity = Number(body?.quantity || 0);
    const warehouseId = body?.warehouseId || null;
    const reservedBy = body?.reservedBy || null;
    const expiresAt = body?.expiresAt || null;

    if (!listingId || !Number.isFinite(quantity) || quantity <= 0) {
      return json({ success: false, error: 'listingId and positive quantity are required' }, 400);
    }

    const listingRes = await db.prepare('SELECT id FROM listing WHERE id = ?').bind(listingId).all();
    const listing = firstRow(listingRes);
    if (!listing) return json({ success: false, error: 'Listing not found' }, 404);

    const id = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `r-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const now = new Date().toISOString();

    await db.prepare('INSERT INTO reservation (id, listingId, warehouseId, quantity, reservedBy, expiresAt, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, listingId, warehouseId, quantity, reservedBy, expiresAt, 'ACTIVE', now, now).run();

    const createdRes = await db.prepare('SELECT id, listingId, warehouseId, quantity, reservedBy, expiresAt, status, createdAt, updatedAt FROM reservation WHERE id = ?').bind(id).all();
    const created = firstRow(createdRes);
    return json({ success: true, reservation: created }, 201);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;
