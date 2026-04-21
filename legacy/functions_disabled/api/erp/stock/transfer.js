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
    const quantity = Number(body?.quantity || 0);
    const fromWarehouseId = body?.fromWarehouseId;
    const toWarehouseId = body?.toWarehouseId;
    const reference = body?.reference || null;
    const performedBy = body?.performedBy || null;
    const notes = body?.notes || null;

    if (!listingId || !fromWarehouseId || !toWarehouseId || !Number.isFinite(quantity)) {
      return json({ success: false, error: 'listingId, fromWarehouseId, toWarehouseId and quantity are required' }, 400);
    }

    if (fromWarehouseId === toWarehouseId) return json({ success: false, error: 'Source and destination warehouses must differ' }, 400);
    if (quantity <= 0) return json({ success: false, error: 'Quantity must be > 0' }, 400);

    const listingRes = await db.prepare('SELECT id FROM listing WHERE id = ?').bind(listingId).all();
    const listing = firstRow(listingRes);
    if (!listing) return json({ success: false, error: 'Listing not found' }, 404);

    const id = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `sm-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const now = new Date().toISOString();

    await db.prepare('INSERT INTO stockMovement (id, listingId, warehouseId, fromWarehouseId, toWarehouseId, quantity, type, reference, performedBy, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, listingId, null, fromWarehouseId, toWarehouseId, quantity, 'TRANSFER', reference, performedBy, notes, now).run();

    return json({ success: true, movement: { id, listingId, fromWarehouseId, toWarehouseId, quantity, type: 'TRANSFER', reference, performedBy, notes, createdAt: now } });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;
