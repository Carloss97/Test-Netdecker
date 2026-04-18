import { pickDb, ensureSchema, firstRow, buildSelectColumns, aliasSelectColumn } from '../../_shared/d1.js';
import { getUSDtoCLPRateMetaFast } from '../../_shared/exchange-rate.js';

async function findCardFallback(db, cardId) {
  if (!cardId) return null;
  try {
    const cardCols = await buildSelectColumns(db, 'card', 'c', ['cardName','externalId','tcg','editionCode','cardCode','imageUrl','priceMarket','priceMid','priceLow','rarity']);

    // prefer aliased select when possible
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

    // Build dynamic select list so older D1 DBs missing columns won't crash
    const listingCols = await buildSelectColumns(db, 'listing', 'l', ['id','cardId','editionCode','referencePrice','marginMultiplier','finalPrice','quantity','status','lastSyncedAt']);
    const cardCols = await buildSelectColumns(db, 'card', 'c', ['cardName','externalId','tcg','rarity','priceMarket','priceMid','priceLow','cardCode','imageUrl']);

    let listingSelect = listingCols;
    listingSelect = aliasSelectColumn(listingSelect, 'l', 'id', 'listingId');
    listingSelect = aliasSelectColumn(listingSelect, 'l', 'editionCode', 'editionCode');

    const selectParts = [];
    if (listingSelect) selectParts.push(listingSelect);
    if (cardCols) selectParts.push(cardCols);

    let sql = `SELECT ${selectParts.join(', ')} FROM listing l LEFT JOIN card c ON l.cardId = c.id WHERE 1=1`;
    const binds = [];
    if (tcg) {
      // include listings even when card row is missing by matching cardId prefix
      sql += ' AND (c.tcg = ? OR l.cardId LIKE ?)'; binds.push(tcg, `${tcg}:%`);
    }
    if (edition) {
      let ed = String(edition).toUpperCase();
      if (ed.includes(':')) ed = ed.split(':').slice(1).join(':');
      // match either card.editionCode or listing.editionCode fallback
      sql += ' AND (c.editionCode = ? OR l.editionCode = ?)'; binds.push(ed, ed);
    }
    if (search) {
      sql += ' AND lower(c.cardName) LIKE ?'; binds.push(`%${search}%`);
    }
    // Order by output aliases to avoid runtime failures when physical columns are missing
    sql += ' ORDER BY quantity DESC, finalPrice ASC LIMIT ? OFFSET ?';
    binds.push(limit, offset);

    let res;
    try {
      res = await db.prepare(sql).bind(...binds).all();
    } catch (err) {
      try { console.error('[available] db query failed', err?.message || err, { sql, binds }); } catch (_) {}
      return new Response(JSON.stringify({ success: false, error: 'DB query failed', message: String(err && err.message ? err.message : err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);

    // Prefer cached FX for on-the-fly CLP computation
    let usdToClp = Number(env.FALLBACK_USD_TO_CLP || env.MANUAL_USD_TO_CLP || 950);
    try {
      const meta = await getUSDtoCLPRateMetaFast(env, db);
      if (meta && Number.isFinite(Number(meta.usdToCLP)) && Number(meta.usdToCLP) > 0) usdToClp = Number(meta.usdToCLP);
    } catch (_) {}

    // Fill missing card data when possible and compute finalPrice if missing
    const out = [];
    const stockAlertThreshold = Number(env.STOCK_ALERT_THRESHOLD || env.VITE_STOCK_ALERT_THRESHOLD || 2);
    const defaultMargin = Number(env.DEFAULT_MARGIN_MULTIPLIER || env.VITE_DEFAULT_MARGIN_MULTIPLIER || 1.2);
    // Batch fetch missing card rows to avoid per-row fallbacks
    const missingCardIds = Array.from(new Set(rows.filter((r) => !r.cardName && r.cardId).map((r) => r.cardId)));
    const chunk = (arr, size) => { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };
    const SQLITE_MAX_VARS = 900;
    const safeSelectChunk = Math.max(1, Math.min(800, Math.floor(SQLITE_MAX_VARS / 1)));
    const cardMap = new Map();
    for (const cids of chunk(missingCardIds, safeSelectChunk)) {
      try {
        const placeholders = cids.map(() => '?').join(',');
        const batchCols = await buildSelectColumns(db, 'card', 'c', ['id','cardName','externalId','tcg','rarity','priceMarket','priceMid','priceLow','cardCode']);
        const sel = await db.prepare(`SELECT ${batchCols} FROM card c WHERE c.id IN (${placeholders})`).bind(...cids).all();
        const rowsRes = Array.isArray(sel?.results) ? sel.results : (Array.isArray(sel) ? sel : []);
        for (const rr of rowsRes) cardMap.set(rr.id || rr.ID || rr.Id || rr.id, rr);
      } catch (_) {}
    }

    for (const r of rows) {
      // Enrich missing card fields from pre-fetched cardMap or fallback
      if (!r.cardName) {
        const fb = cardMap.get(r.cardId) || null;
        if (fb) {
          r.cardName = fb.cardName || r.cardName;
          r.externalId = fb.externalId || r.externalId;
          r.tcg = fb.tcg || r.tcg;
          r.rarity = fb.rarity || r.rarity;
          r.priceMarket = fb.priceMarket || r.priceMarket;
          r.priceMid = fb.priceMid || r.priceMid;
          r.priceLow = fb.priceLow || r.priceLow;
          r.cardCode = fb.cardCode || r.cardCode;
        } else {
          try {
            const fallback = await findCardFallback(db, r.cardId);
            if (fallback) {
              r.cardName = fallback.cardName || r.cardName;
              r.externalId = fallback.externalId || r.externalId;
              r.tcg = fallback.tcg || r.tcg;
              r.rarity = fallback.rarity || r.rarity;
              r.priceMarket = fallback.priceMarket || r.priceMarket;
              r.priceMid = fallback.priceMid || r.priceMid;
              r.priceLow = fallback.priceLow || r.priceLow;
              r.cardCode = fallback.cardCode || r.cardCode;
              r.imageUrl = fallback.imageUrl || r.imageUrl;
            }
          } catch (_) {}
        }
      }

      const margin = Number(r.marginMultiplier || defaultMargin);
      let finalPrice = Number(r.finalPrice) || 0;
      const ref = Number(r.referencePrice) || Number(r.priceMarket) || Number(r.priceMid) || Number(r.priceLow) || 0;
      let priceComputed = false;
      if ((!finalPrice || finalPrice <= 0) && ref > 0) {
        finalPrice = Math.round(ref * margin * usdToClp);
        priceComputed = true;
      }

      if (!r.cardName) r.cardName = r.externalId || r.cardCode || r.cardId || null;
      const stockAlert = Number(r.quantity || 0) <= stockAlertThreshold;

      const externalId = r.externalId || (r.cardId ? String(r.cardId).split(':').pop() : null);
      const cardObj = {
        id: externalId || null,
        tcgId: r.tcg || null,
        editionId: r.editionCode ? `${r.tcg || ''}:${r.editionCode}` : null,
        cardCode: r.cardCode || null,
        cardName: r.cardName || null,
        cardNumber: r.cardCode || null,
        rarity: r.rarity || null,
        imageUrl: r.imageUrl || null,
      };

      const listingObj = {
        id: r.listingId || r.id || null,
        cardId: r.cardId || null,
        card: cardObj,
        editionId: cardObj.editionId || (r.editionCode ? `${r.tcg || ''}:${r.editionCode}` : null),
        condition: r.condition || 'NM',
        quantity: Number(r.quantity) || 0,
        referencePrice: Number(r.referencePrice) || 0,
        marginMultiplier: margin,
        exchangeRate: usdToClp,
        finalPrice,
        currency: 'CLP',
        status: r.status || 'active',
        lastSyncedAt: r.lastSyncedAt || null,
        priceComputed,
        stockAlert,
      };

      out.push(listingObj);
    }

    return new Response(JSON.stringify({ success: true, total: out.length, listings: out }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export default onRequest;

