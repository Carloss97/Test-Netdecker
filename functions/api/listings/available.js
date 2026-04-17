import { pickDb, ensureSchema } from '../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const limit = Math.min(Number(params.limit) || 50, 200);
    const offset = Number(params.offset) || 0;
    // accept both `tcg`/`edition` and frontend `tcgId`/`editionId`
    const tcg = params.tcg || params.tcgId || null;
    const edition = params.edition || params.editionId || null;
    const search = params.search ? String(params.search).trim().toLowerCase() : null;

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    let sql = `SELECT l.id as listingId, l.cardId, l.editionCode, l.referencePrice, l.marginMultiplier, l.finalPrice, l.quantity, l.status, l.lastSyncedAt, c.cardName, c.externalId, c.tcg, c.rarity
      FROM listing l JOIN card c ON l.cardId = c.id WHERE 1=1`;
    const binds = [];
    if (tcg) {
      sql += ' AND c.tcg = ?'; binds.push(tcg);
    }
    if (edition) {
      let ed = String(edition).toUpperCase();
      if (ed.includes(':')) ed = ed.split(':').slice(1).join(':');
      sql += ' AND c.editionCode = ?'; binds.push(ed);
    }
    if (search) {
      sql += ' AND lower(c.cardName) LIKE ?'; binds.push(`%${search}%`);
    }
    sql += ' ORDER BY l.quantity DESC, l.finalPrice ASC LIMIT ? OFFSET ?';
    binds.push(limit, offset);

    const res = await db.prepare(sql).bind(...binds).all();
    const rows = Array.isArray(res.results) ? res.results : (Array.isArray(res) ? res : []);
    return new Response(JSON.stringify({ success: true, total: rows.length, listings: rows }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
