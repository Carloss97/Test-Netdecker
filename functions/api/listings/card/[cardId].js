import { pickDb, ensureSchema } from '../../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const { cardId } = params || {};
    if (!cardId) return new Response(JSON.stringify({ success: false, error: 'cardId missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    // cardId may be externalId (numeric/string) or composite id like TCG:123
    const res = await db.prepare(`SELECT l.id as listingId, l.cardId, l.editionCode, l.referencePrice, l.marginMultiplier, l.finalPrice, l.quantity, l.status, l.lastSyncedAt, c.cardName, c.externalId, c.tcg, c.rarity
      FROM listing l JOIN card c ON l.cardId = c.id WHERE c.externalId = ? OR c.id = ? OR l.cardId = ? ORDER BY l.quantity DESC, l.finalPrice ASC`)
      .bind(cardId, cardId, cardId).all();
    const rows = Array.isArray(res.results) ? res.results : (Array.isArray(res) ? res : []);
    return new Response(JSON.stringify({ success: true, total: rows.length, listings: rows }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
