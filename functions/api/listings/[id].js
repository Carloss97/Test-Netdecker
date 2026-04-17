import { pickDb, ensureSchema, buildSelectColumns } from '../../_shared/d1.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const { id } = params || {};
    if (!id) return json({ success: false, error: 'id missing' }, 400);
    const db = pickDb(env);
    if (!db) return json({ success: false, error: 'No DB binding' }, 500);
    await ensureSchema(db);

    const listingCols = await buildSelectColumns(db, 'listing', 'l', ['id','cardId','editionCode','condition','rarity','quantity','referencePrice','marginMultiplier','exchangeRate','finalPrice','currency','costPrice','status','everHadStock','lastSyncedAt','createdAt','updatedAt']);
    const cardCols = await buildSelectColumns(db, 'card', 'c', ['id','externalId','tcg','editionCode','cardCode','cardName','cardNumber','rarity','imageUrl','priceLow','priceMid','priceMarket']);

    const sql = `SELECT ${listingCols}, ${cardCols} FROM listing l LEFT JOIN card c ON c.id = l.cardId WHERE l.id = ? LIMIT 1`;
    const res = await db.prepare(sql).bind(id).all();
    const row = Array.isArray(res?.results) ? res.results[0] : (Array.isArray(res) ? res[0] : null);
    if (!row) return json({ success: false, error: 'Listing not found' }, 404);
    return json({ success: true, listing: row });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}
