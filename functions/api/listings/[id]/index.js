import { pickDb, ensureSchema } from '../../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const { id } = params || {};
    if (!id) return new Response(JSON.stringify({ success: false, error: 'id missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    const res = await db.prepare('SELECT l.id as listingId, l.cardId, l.editionCode, l.referencePrice, l.marginMultiplier, l.finalPrice, l.quantity, l.status, l.lastSyncedAt, c.cardName, c.externalId, c.tcg, c.rarity FROM listing l JOIN card c ON l.cardId = c.id WHERE l.id = ?')
      .bind(id).all();
    const row = Array.isArray(res.results) ? res.results[0] : (Array.isArray(res) ? res[0] : null);
    if (!row) return new Response(JSON.stringify({ success: false, error: 'Listing not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ success: true, listing: row }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
