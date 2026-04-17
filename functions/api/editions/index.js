import { pickDb, ensureSchema, firstRow } from '../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const tcg = url.searchParams.get('tcgId') || url.searchParams.get('tcg') || null;
    const activeOnly = url.searchParams.get('activeOnly');
    const filterActive = activeOnly === null ? true : activeOnly !== 'false';

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    const binds = [];
    let where = '';
    if (tcg) { where += ' AND tcg = ?'; binds.push(tcg); }
    if (filterActive) { where += ' AND isActive = 1'; }

    const sql = `SELECT id, tcg, editionCode, editionName, releaseDate, isActive FROM edition WHERE 1=1 ${where} ORDER BY releaseDate DESC`;
    const res = await db.prepare(sql).bind(...binds).all();
    const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);

    const out = [];
    for (const r of rows) {
      const id = r.id || r.ID || r.Id;
      const tcgVal = r.tcg || null;
      const editionCode = r.editionCode || null;
      // counts
      const cardsRes = await db.prepare('SELECT COUNT(*) AS cnt FROM card WHERE tcg = ? AND editionCode = ?').bind(tcgVal, editionCode).all();
      const listingsRes = await db.prepare('SELECT COUNT(*) AS cnt FROM listing WHERE editionCode = ?').bind(editionCode).all();
      const cardsCnt = firstRow(cardsRes)?.cnt || 0;
      const listingsCnt = firstRow(listingsRes)?.cnt || 0;

      out.push({
        id,
        editionCode: editionCode,
        editionName: r.editionName || null,
        releaseDate: r.releaseDate || null,
        isActive: Boolean(r.isActive),
        tcgId: tcgVal,
        tcg: { id: tcgVal, name: tcgVal, displayName: tcgVal },
        cardCount: Number(cardsCnt || 0),
        listingCount: Number(listingsCnt || 0),
      });
    }

    return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
