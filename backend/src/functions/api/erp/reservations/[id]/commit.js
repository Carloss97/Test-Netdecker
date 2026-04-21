import { pickDb, ensureSchema, firstRow } from '../../../../_shared/d1.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { env, params, request } = context;
  try {
    const { id } = params || {};
    if (!id) return json({ success: false, error: 'id missing' }, 400);

    const db = pickDb(env);
    if (!db) return json({ success: false, error: 'No DB binding available' }, 500);
    await ensureSchema(db);

    const body = await request.json().catch(() => ({}));
    const performedBy = body?.performedBy || null;

    const res = await db.prepare('SELECT id, listingId, quantity, status, warehouseId FROM reservation WHERE id = ?').bind(id).all();
    const reservation = firstRow(res);
    if (!reservation) return json({ success: false, error: 'Reservation not found' }, 404);
    if (String(reservation.status).toUpperCase() !== 'ACTIVE') return json({ success: false, error: 'Reservation not active' }, 409);

    const listingRes = await db.prepare('SELECT id, quantity FROM listing WHERE id = ?').bind(reservation.listingId).all();
    const listing = firstRow(listingRes);
    if (!listing) return json({ success: false, error: 'Listing not found' }, 404);

    const qty = Number(reservation.quantity || 0);
    if (Number(listing.quantity || 0) < qty) return json({ success: false, error: 'Insufficient stock to commit reservation' }, 409);

    const now = new Date().toISOString();
    const movementId = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `sm-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    await db.prepare('INSERT INTO stockMovement (id, listingId, warehouseId, quantity, type, reference, performedBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(movementId, reservation.listingId, reservation.warehouseId || null, qty, 'OUT', `reservation:${id}`, performedBy, now).run();

    await db.prepare('UPDATE listing SET quantity = quantity - ? WHERE id = ?').bind(qty, reservation.listingId).run();

    await db.prepare('UPDATE reservation SET status = ?, updatedAt = ? WHERE id = ?').bind('COMMITTED', now, id).run();

    const updatedRes = await db.prepare('SELECT id, listingId, quantity, status, warehouseId FROM reservation WHERE id = ?').bind(id).all();
    const updated = firstRow(updatedRes);
    return json({ success: true, reservation: updated });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;
