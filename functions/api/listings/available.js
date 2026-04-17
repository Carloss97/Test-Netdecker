import { pickDb, ensureSchema, firstRow } from '../../_shared/d1.js';

async function findCardFallback(db, cardId) {
  if (!cardId) return null;
  try {
    const r1 = await db.prepare('SELECT cardName, externalId, tcg, editionCode FROM card WHERE id = ?').bind(cardId).all();
    const row1 = firstRow(r1);
    if (row1) return row1;
    const parts = String(cardId).split(':').filter(Boolean);
    if (parts.length >= 2) {
      const tcg = parts[0];
      const maybe = parts[parts.length - 1];
      const r2 = await db.prepare('SELECT cardName, externalId, tcg, editionCode FROM card WHERE tcg = ? AND (externalId = ? OR cardCode = ? OR id = ?) LIMIT 1')
        .bind(tcg, maybe, maybe, `${tcg}:${maybe}`).all();
      const row2 = firstRow(r2);
      if (row2) return row2;
      const r3 = await db.prepare('SELECT cardName, externalId, tcg, editionCode FROM card WHERE externalId = ? LIMIT 1').bind(maybe).all();
      const row3 = firstRow(r3);
      if (row3) return row3;
    }
    const last = String(cardId).slice(-10);
    const r4 = await db.prepare('SELECT cardName, externalId, tcg, editionCode FROM card WHERE cardName LIKE ? LIMIT 1').bind(`%${last}%`).all();
    return firstRow(r4);
  } catch (err) {
    return null;
  }
}

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
      FROM listing l LEFT JOIN card c ON l.cardId = c.id WHERE 1=1`;
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

    // Fill missing card data when possible
    const out = [];
    for (const r of rows) {
      if (!r.cardName) {
        try {
          const fb = await findCardFallback(db, r.cardId);
          if (fb) {
            r.cardName = fb.cardName || r.cardName;
            r.externalId = fb.externalId || r.externalId;
            r.tcg = fb.tcg || r.tcg;
          }
        } catch (_) {}
      }
      out.push(r);
    }

    return new Response(JSON.stringify({ success: true, total: out.length, listings: out }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
