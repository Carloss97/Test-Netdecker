import { pickDb, ensureSchema, firstRow } from '../../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const id = params.id;
    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ error: 'No DB bound' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    const res = await db.prepare('SELECT id, tcg, editionCode, editionName, releaseDate, isActive FROM edition WHERE id = ?').bind(id).all();
    const row = firstRow(res);
    if (!row) return new Response(JSON.stringify({ error: 'Edition not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    const tcg = row.tcg;
    const editionCode = row.editionCode;

    const cardsRes = await db.prepare('SELECT COUNT(*) AS cnt FROM card WHERE tcg = ? AND editionCode = ?').bind(tcg, editionCode).all();
    const listingsRes = await db.prepare('SELECT COUNT(*) AS cnt FROM listing WHERE editionCode = ?').bind(editionCode).all();
    const cardsCnt = firstRow(cardsRes)?.cnt || 0;
    const listingsCnt = firstRow(listingsRes)?.cnt || 0;

    return new Response(JSON.stringify({
      id: row.id,
      editionCode,
      editionName: row.editionName || null,
      releaseDate: row.releaseDate || null,
      isActive: Boolean(row.isActive),
      tcgId: tcg,
      tcg: { id: tcg, name: tcg, displayName: tcg },
      cardCount: Number(cardsCnt || 0),
      listingCount: Number(listingsCnt || 0),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
