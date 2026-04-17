import { pickDb, ensureSchema, buildSelectColumns, aliasSelectColumn } from '../../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const { cardId } = params || {};
    if (!cardId) return new Response(JSON.stringify({ success: false, error: 'cardId missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    // cardId may be externalId (numeric/string) or composite id like TCG:123
    const cardCols = await buildSelectColumns(db, 'card', 'c', ['cardName','externalId','tcg','rarity']);
    const selectCard = cardCols;

    // build safe listing select to tolerate older D1 schemas
    const listingCols = await buildSelectColumns(db, 'listing', 'l', ['id','cardId','editionCode','referencePrice','marginMultiplier','finalPrice','quantity','status','lastSyncedAt']);
    let listingSelect = listingCols;
    listingSelect = aliasSelectColumn(listingSelect, 'l', 'id', 'listingId');
    listingSelect = aliasSelectColumn(listingSelect, 'l', 'editionCode', 'editionCode');

    // Order by output aliases to avoid runtime failures when physical columns are missing
    const sql = `SELECT ${listingSelect}, ${selectCard} FROM listing l LEFT JOIN card c ON l.cardId = c.id WHERE c.externalId = ? OR c.id = ? OR l.cardId = ? ORDER BY quantity DESC, finalPrice ASC`;
    const res = await db.prepare(sql).bind(cardId, cardId, cardId).all();
    const rows = Array.isArray(res.results) ? res.results : (Array.isArray(res) ? res : []);
    return new Response(JSON.stringify({ success: true, total: rows.length, listings: rows }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
