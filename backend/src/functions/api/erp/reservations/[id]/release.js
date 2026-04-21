import { pickDb, ensureSchema, firstRow } from '../../../../_shared/d1.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { env, params } = context;
  try {
    const { id } = params || {};
    if (!id) return json({ success: false, error: 'id missing' }, 400);

    const db = pickDb(env);
    if (!db) return json({ success: false, error: 'No DB binding available' }, 500);
    await ensureSchema(db);

    const res = await db.prepare('SELECT id, status FROM reservation WHERE id = ?').bind(id).all();
    const reservation = firstRow(res);
    if (!reservation) return json({ success: false, error: 'Reservation not found' }, 404);
    if (String(reservation.status).toUpperCase() !== 'ACTIVE') return json({ success: true, reservation });

    const now = new Date().toISOString();
    await db.prepare('UPDATE reservation SET status = ?, updatedAt = ? WHERE id = ?').bind('RELEASED', now, id).run();
    const updatedRes = await db.prepare('SELECT id, listingId, quantity, status, warehouseId FROM reservation WHERE id = ?').bind(id).all();
    const updated = firstRow(updatedRes);
    return json({ success: true, reservation: updated });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;
