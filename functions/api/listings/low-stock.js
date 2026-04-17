import { pickDb, ensureSchema, firstRow, getTableColumns, buildSelectColumns } from '../../_shared/d1.js';
import { getUSDtoCLPRateMetaFast } from '../../_shared/exchange-rate.js';

async function findCardFallback(db, cardId) {
  if (!cardId) return null;
  try {
    const cardCols = await buildSelectColumns(db, 'card', 'c', ['cardName','externalId','tcg','editionCode','cardCode','imageUrl','priceMarket','priceMid','priceLow','rarity']);
    const selById = `SELECT ${cardCols} FROM card c WHERE c.id = ?`;
    const r1 = await db.prepare(selById).bind(cardId).all();
    const row1 = firstRow(r1);
    if (row1) return row1;

    const parts = String(cardId).split(':').filter(Boolean);
    if (parts.length >= 2) {
      const tcg = parts[0];
      const maybe = parts[parts.length - 1];
      const selByTcg = `SELECT ${cardCols} FROM card c WHERE c.tcg = ? AND (c.externalId = ? OR c.cardCode = ? OR c.id = ?) LIMIT 1`;
      const r2 = await db.prepare(selByTcg).bind(tcg, maybe, maybe, `${tcg}:${maybe}`).all();
      const row2 = firstRow(r2);
      if (row2) return row2;

      const selByExternal = `SELECT ${cardCols} FROM card c WHERE c.externalId = ? LIMIT 1`;
      const r3 = await db.prepare(selByExternal).bind(maybe).all();
      const row3 = firstRow(r3);
      if (row3) return row3;
    }

    const last = String(cardId).slice(-10);
    const selByName = `SELECT ${cardCols} FROM card c WHERE lower(c.cardName) LIKE ? LIMIT 1`;
    const r4 = await db.prepare(selByName).bind(`%${last}%`).all();
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

    // get fast cached FX for computing CLP final price if needed
    let usdToClp = Number(env.FALLBACK_USD_TO_CLP || env.MANUAL_USD_TO_CLP || 950);
    try {
      const meta = await getUSDtoCLPRateMetaFast(env, db);
      if (meta && Number.isFinite(Number(meta.usdToCLP)) && Number(meta.usdToCLP) > 0) usdToClp = Number(meta.usdToCLP);
    } catch (_) {}
    const defaultMargin = Number(env.DEFAULT_MARGIN_MULTIPLIER || env.VITE_DEFAULT_MARGIN_MULTIPLIER || 1.2);

    // Only consider listings that at some point had stock (everHadStock = 1) and are active/manual
    const listingCols = await buildSelectColumns(db, 'listing', 'l', ['id','quantity','editionCode','cardId','referencePrice','marginMultiplier','finalPrice','everHadStock','status']);
    // decide whether to include everHadStock predicate depending on D1 schema
    const existing = await getTableColumns(db, 'listing');
    const hasEverHadStock = existing.includes('everHadStock');
    let whereClause = 'WHERE l.quantity <= ? AND l.status IN ("active","manual")';
    const bindsArr = [threshold, limit];
    if (hasEverHadStock) {
      whereClause = 'WHERE l.quantity <= ? AND l.everHadStock = 1 AND l.status IN ("active","manual")';
    }

    const sql = `SELECT ${listingCols} FROM listing l ${whereClause} ORDER BY l.quantity ASC LIMIT ?`;
    const res = await db.prepare(sql).bind(...bindsArr).all();
    const rows = Array.isArray(res.results) ? res.results : (Array.isArray(res) ? res : []);

    // Batch fetch card rows for all listings to avoid N+1
    const cardIds = Array.from(new Set(rows.map((r) => r.cardId).filter(Boolean)));
    const chunk = (arr, size) => { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };
    const cardMap = new Map();
    for (const cids of chunk(cardIds, 50)) {
      try {
        const placeholders = cids.map(() => '?').join(',');
        const batchCols = await buildSelectColumns(db, 'card', 'c', ['id','cardName','externalId','tcg','editionCode','cardCode','imageUrl','priceMarket','priceMid','priceLow']);
        const sel = await db.prepare(`SELECT ${batchCols} FROM card c WHERE c.id IN (${placeholders})`).bind(...cids).all();
        const rowsRes = Array.isArray(sel?.results) ? sel.results : (Array.isArray(sel) ? sel : []);
        for (const rr of rowsRes) cardMap.set(rr.id || rr.ID || rr.Id || rr.id, rr);
      } catch (_) {}
    }

    const out = [];
    for (const r of rows) {
      let card = cardMap.get(r.cardId) || null;
      if (!card) {
        try { card = await findCardFallback(db, r.cardId); } catch (_) { card = null; }
      }

      const qty = Number(r.quantity || 0);
      const listingRef = Number(r.referencePrice || 0);
      const cardPrice = card ? (Number(card.priceMarket || card.priceMid || card.priceLow) || 0) : 0;
      const ref = listingRef || cardPrice;
      const margin = (Number(r.marginMultiplier) || defaultMargin);
      let finalPrice = Number(r.finalPrice || 0);
      let priceComputed = false;
      if ((!finalPrice || finalPrice <= 0) && ref > 0) {
        finalPrice = Math.round(ref * margin * usdToClp);
        priceComputed = true;
      }

      out.push({ listingId: r.listingId, quantity: qty, editionCode: r.editionCode, cardName: card?.cardName || card?.externalId || r.cardId, externalId: card?.externalId || null, tcg: card?.tcg || null, cardId: r.cardId, finalPrice, priceComputed, stockAlert: true });
    }

    return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify([]), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
