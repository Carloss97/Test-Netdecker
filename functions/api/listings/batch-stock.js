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
    for (const u of updates) {
      try {
        if (!u || typeof u.listingId !== 'string' || typeof u.quantity !== 'number' || u.quantity < 0) {
          results.push({ listingId: u?.listingId || null, success: false, error: 'invalid update payload' });
          continue;
        }
        const q = Math.max(0, Math.floor(u.quantity));
        // Update quantity and set everHadStock when >0
        await db.prepare('UPDATE listing SET quantity = ?, everHadStock = CASE WHEN ? > 0 THEN 1 ELSE everHadStock END, updatedAt = ? WHERE id = ?')
          .bind(q, q, new Date().toISOString(), u.listingId)
          .run();
        updated += 1;
        results.push({ listingId: u.listingId, success: true, quantity: q });
      } catch (err) {
        results.push({ listingId: u?.listingId || null, success: false, error: String(err) });
      }
    }

    return json({ success: true, updated, results }, 200);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}
