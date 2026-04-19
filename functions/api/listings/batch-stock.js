import { pickDb, ensureSchema } from '../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env } = context;
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }

    if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

    const body = await request.json().catch(() => ({}));
    const updates = Array.isArray(body?.updates) ? body.updates : null;
    if (!updates || updates.length === 0) return json({ success: false, error: 'updates must be a non-empty array' }, 400);

    const db = pickDb(env);
    if (!db) return json({ success: false, error: 'No DB binding available' }, 500);
    await ensureSchema(db);

    const results = [];
    let updated = 0;
    const globalStoreId = body.storeId || null;
    for (const u of updates) {
      try {
        if (!u || typeof u.listingId !== 'string' || typeof u.quantity !== 'number' || u.quantity < 0) {
          results.push({ listingId: u?.listingId || null, success: false, error: 'invalid update payload' });
          continue;
        }
        const q = Math.max(0, Math.floor(u.quantity));
        const storeId = u.storeId || globalStoreId || null;
        if (storeId) {
          // update or insert listingStock for this store
          const curRes = await db.prepare('SELECT id, quantity FROM listingStock WHERE listingId = ? AND storeId = ?').bind(u.listingId, storeId).all();
          const curRow = Array.isArray(curRes.results) ? curRes.results[0] : (Array.isArray(curRes) ? curRes[0] : null);
          const now = new Date().toISOString();
          if (curRow) {
            await db.prepare('UPDATE listingStock SET quantity = ?, updatedAt = ? WHERE id = ?').bind(q, now, curRow.id).run();
          } else {
            const sid = (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : `ls-${Date.now()}-${Math.floor(Math.random()*10000)}`;
            await db.prepare('INSERT INTO listingStock (id, storeId, listingId, quantity, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)').bind(sid, storeId, u.listingId, q, now, now).run();
          }
          // recompute aggregate and update listing.quantity
          const aggRes = await db.prepare('SELECT SUM(quantity) as total FROM listingStock WHERE listingId = ?').bind(u.listingId).all();
          const aggRow = Array.isArray(aggRes.results) ? aggRes.results[0] : (Array.isArray(aggRes) ? aggRes[0] : null);
          const total = aggRow ? (Number(aggRow.total) || 0) : 0;
          await db.prepare('UPDATE listing SET quantity = ?, everHadStock = CASE WHEN ? > 0 THEN 1 ELSE everHadStock END, updatedAt = ? WHERE id = ?')
            .bind(total, total, new Date().toISOString(), u.listingId).run();
          updated += 1;
          results.push({ listingId: u.listingId, success: true, storeId, storeQuantity: q, quantity: total });
        } else {
          // legacy global listing update
          await db.prepare('UPDATE listing SET quantity = ?, everHadStock = CASE WHEN ? > 0 THEN 1 ELSE everHadStock END, updatedAt = ? WHERE id = ?')
            .bind(q, q, new Date().toISOString(), u.listingId)
            .run();
          updated += 1;
          results.push({ listingId: u.listingId, success: true, quantity: q });
        }
      } catch (err) {
        results.push({ listingId: u?.listingId || null, success: false, error: String(err) });
      }
    }

    return json({ success: true, updated, results }, 200);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;
