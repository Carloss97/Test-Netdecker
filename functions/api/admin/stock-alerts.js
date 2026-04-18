import { pickDb, ensureSchema, buildSelectColumns, aliasSelectColumn } from '../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const threshold = Number.isFinite(Number(url.searchParams.get('threshold'))) ? Number(url.searchParams.get('threshold')) : 2;

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ alerts: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    const cardCols = await buildSelectColumns(db, 'card', 'c', ['cardName']);
    const listingCols = await buildSelectColumns(db, 'listing', 'l', ['id','quantity','referencePrice','editionCode']);
    let listingSelect = listingCols || '';
    listingSelect = aliasSelectColumn(listingSelect, 'l', 'id', 'listingId');
    listingSelect = aliasSelectColumn(listingSelect, 'l', 'editionCode', 'editionCode');
    const selectCard = cardCols || 'c.cardName AS cardName';
    const sql = `SELECT ${listingSelect}, ${selectCard} FROM listing l LEFT JOIN card c ON c.id = l.cardId WHERE COALESCE(quantity,0) <= ? ORDER BY COALESCE(quantity,0) ASC LIMIT 200;`;
    const res = await db.prepare(sql).bind(threshold).all();
    const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
    const alerts = rows.map((r) => ({ listingId: r.listingId, quantity: r.quantity || 0, cardName: r.cardName || 'Unknown', editionCode: r.editionCode || null, finalPrice: Math.round((r.referencePrice || 0) * 100) / 100 }));

    return new Response(JSON.stringify({ alerts }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ alerts: [] , error: String(err)}), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export default onRequest;
