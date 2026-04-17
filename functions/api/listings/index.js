import { pickDb, ensureSchema, buildSelectColumns } from '../../_shared/d1.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const take = Number(url.searchParams.get('take') || '20') || 20;
    const skip = Number(url.searchParams.get('skip') || '0') || 0;
    const tcgId = url.searchParams.get('tcgId') || null;
    const editionId = url.searchParams.get('editionId') || null;

    const db = pickDb(env);
    if (!db) return json({ success: false, error: 'No DB binding' }, 500);
    await ensureSchema(db);

    const listingCols = await buildSelectColumns(db, 'listing', 'l', ['id','cardId','editionCode','condition','rarity','quantity','referencePrice','marginMultiplier','exchangeRate','finalPrice','currency','costPrice','status','everHadStock','lastSyncedAt','createdAt','updatedAt']);
    const cardCols = await buildSelectColumns(db, 'card', 'c', ['id','externalId','tcg','editionCode','cardCode','cardName','cardNumber','rarity','imageUrl','priceLow','priceMid','priceMarket']);

    let sql = `SELECT ${listingCols}, ${cardCols} FROM listing l LEFT JOIN card c ON c.id = l.cardId`;
    const binds = [];
    const where = [];
    if (tcgId) { where.push('c.tcg = ?'); binds.push(tcgId); }
    if (editionId) { where.push('(l.editionCode = ? OR c.editionCode = ?)'); binds.push(editionId, editionId); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY l.finalPrice ASC LIMIT ? OFFSET ?';
    binds.push(take, skip);

    const res = await db.prepare(sql).bind(...binds).all();
    const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
    return json({ success: true, listings: rows });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}
