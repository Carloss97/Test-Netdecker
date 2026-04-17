import { pickDb, ensureSchema, firstRow } from '../../_shared/d1.js';

async function findCardFallback(db, cardId) {
  if (!cardId) return null;
  try {
    // Try direct id lookup
    const r1 = await db.prepare('SELECT cardName, externalId, tcg, editionCode FROM card WHERE id = ?').bind(cardId).all();
    const row1 = firstRow(r1);
    if (row1) return row1;

    const parts = String(cardId).split(':').filter(Boolean);
    if (parts.length >= 2) {
      const tcg = parts[0];
      const maybe = parts[parts.length - 1];
      // Try common fallbacks: externalId, cardCode, or id variants
      const r2 = await db.prepare('SELECT cardName, externalId, tcg, editionCode FROM card WHERE tcg = ? AND (externalId = ? OR cardCode = ? OR id = ?) LIMIT 1')
        .bind(tcg, maybe, maybe, `${tcg}:${maybe}`).all();
      const row2 = firstRow(r2);
      if (row2) return row2;

      const r3 = await db.prepare('SELECT cardName, externalId, tcg, editionCode FROM card WHERE externalId = ? LIMIT 1').bind(maybe).all();
      const row3 = firstRow(r3);
      if (row3) return row3;
    }

    // Last resort: try to find any card that contains the last segment
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
    const url = new URL(request.url);
    const threshold = Number(url.searchParams.get('threshold') || url.searchParams.get('t') || '2');
    const limit = Math.min(Number(url.searchParams.get('limit') || '200'), 1000);

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    const res = await db.prepare('SELECT l.id as listingId, l.quantity, l.editionCode, l.cardId FROM listing l WHERE l.quantity <= ? ORDER BY l.quantity ASC LIMIT ?')
      .bind(threshold, limit).all();
    const rows = Array.isArray(res.results) ? res.results : (Array.isArray(res) ? res : []);

    const out = [];
    for (const r of rows) {
      let card = null;
      try { card = await findCardFallback(db, r.cardId); } catch (_) { card = null; }
      out.push({ listingId: r.listingId, quantity: r.quantity, editionCode: r.editionCode, cardName: card?.cardName || null, externalId: card?.externalId || null, tcg: card?.tcg || null, cardId: r.cardId });
    }

    return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify([]), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
