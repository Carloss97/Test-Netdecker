import { pickDb, ensureSchema, firstRow, buildSelectColumns } from '../../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const id = params.id;
    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ error: 'No DB bound' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    const editionCols = await buildSelectColumns(db, 'edition', 'e', ['id','tcg','editionCode','editionName','releaseDate','isActive']);
    let res = await db.prepare(`SELECT ${editionCols} FROM edition e WHERE e.id = ?`).bind(id).all();
    let row = firstRow(res);
    // Fallback: if no edition found by composite id, try parsing param like "TCG:CODE" and search by tcg + editionCode
    if (!row) {
      try {
        const decoded = decodeURIComponent(String(id));
        const parts = String(decoded).split(':').filter(Boolean);
        if (parts.length >= 2) {
          const tcg = parts[0].toUpperCase();
          const maybeCode = parts.slice(1).join(':').toUpperCase();
          res = await db.prepare(`SELECT ${editionCols} FROM edition e WHERE e.tcg = ? AND upper(e.editionCode) = ? LIMIT 1`).bind(tcg, maybeCode).all();
          row = firstRow(res);
        }
      } catch (_) {}
    }
    // Another fallback: try searching by editionCode alone (uppercased)
    if (!row) {
      try {
        const codeOnly = String(id).includes(':') ? String(id).split(':').pop() : String(id);
        res = await db.prepare(`SELECT ${editionCols} FROM edition e WHERE upper(e.editionCode) = ? LIMIT 1`).bind(String(codeOnly).toUpperCase()).all();
        row = firstRow(res);
      } catch (_) {}
    }
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
