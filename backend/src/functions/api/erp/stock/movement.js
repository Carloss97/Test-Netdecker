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
    const type = String(body?.type || '');
    const warehouseId = body?.warehouseId || null;
    const fromWarehouseId = body?.fromWarehouseId || null;
    const toWarehouseId = body?.toWarehouseId || null;
    const reference = body?.reference || null;
    const performedBy = body?.performedBy || null;
    const notes = body?.notes || null;

    if (!listingId || !type || !Number.isFinite(quantity)) {
      return json({ success: false, error: 'listingId, type and quantity are required' }, 400);
    }

    const listingRes = await db.prepare('SELECT id, quantity FROM listing WHERE id = ?').bind(listingId).all();
    const listing = firstRow(listingRes);
    if (!listing) return json({ success: false, error: 'Listing not found' }, 404);

    const t = String(type).toUpperCase();
    const now = new Date().toISOString();

    if (t === 'IN') {
      await db.prepare('UPDATE listing SET quantity = COALESCE(quantity,0) + ?, everHadStock = 1 WHERE id = ?').bind(quantity, listingId).run();
    } else if (t === 'OUT') {
      const current = Number(listing.quantity || 0);
      if (current < quantity) return json({ success: false, error: 'Insufficient stock' }, 409);
      await db.prepare('UPDATE listing SET quantity = quantity - ? WHERE id = ?').bind(quantity, listingId).run();
    } else if (t === 'ADJUST') {
      const newQuantity = Number(listing.quantity || 0) + quantity;
      if (newQuantity < 0) return json({ success: false, error: 'Resulting quantity cannot be negative' }, 400);
      await db.prepare('UPDATE listing SET quantity = ? WHERE id = ?').bind(newQuantity, listingId).run();
    } else if (t === 'TRANSFER') {
      // Transfer does not alter global listing.quantity in this D1 implementation.
    } else {
      return json({ success: false, error: 'Unsupported movement type' }, 400);
    }

    const id = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `sm-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    await db.prepare('INSERT INTO stockMovement (id, listingId, warehouseId, fromWarehouseId, toWarehouseId, quantity, type, reference, performedBy, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, listingId, warehouseId, fromWarehouseId, toWarehouseId, quantity, t, reference, performedBy, notes, now).run();

    const updatedRes = await db.prepare('SELECT id, quantity FROM listing WHERE id = ?').bind(listingId).all();
    const updated = firstRow(updatedRes);

    return json({ success: true, movement: { id, listingId, quantity, type: t, reference, performedBy, notes, createdAt: now }, listing: updated });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;
