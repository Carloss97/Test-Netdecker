import { pickDb, ensureSchema, firstRow, buildSelectColumns, aliasSelectColumn } from '../../../_shared/d1.js';
import { getUSDtoCLPRateMetaFast } from '../../../_shared/exchange-rate.js';

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
  } catch (_) {
    return null;
  }
}

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const { id } = params || {};
    if (!id) return new Response(JSON.stringify({ success: false, error: 'id missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    const listingCols = await buildSelectColumns(db, 'listing', 'l', ['id','cardId','editionCode','referencePrice','marginMultiplier','finalPrice','quantity','status','lastSyncedAt']);
    const cardCols = await buildSelectColumns(db, 'card', 'c', ['cardName','externalId','tcg','rarity','priceMarket','priceMid','priceLow']);

    let listingSelect = listingCols;
    listingSelect = aliasSelectColumn(listingSelect, 'l', 'id', 'listingId');

    const selectParts = [listingSelect];
    if (cardCols) selectParts.push(cardCols);

    const res = await db.prepare(`SELECT ${selectParts.join(', ')} FROM listing l LEFT JOIN card c ON l.cardId = c.id WHERE l.id = ?`).bind(id).all();
    let row = Array.isArray(res.results) ? res.results[0] : (Array.isArray(res) ? res[0] : null);
    if (!row) {
      // Try to fetch listing only and allow returning with fallback card info (use dynamic select to avoid missing-column failures)
      const lrRes = await db.prepare(`SELECT ${listingSelect} FROM listing l WHERE l.id = ?`).bind(id).all();
      row = Array.isArray(lrRes.results) ? lrRes.results[0] : (Array.isArray(lrRes) ? lrRes[0] : null);
      if (!row) return new Response(JSON.stringify({ success: false, error: 'Listing not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      // try to enrich with card data
      try { const fb = await findCardFallback(db, row.cardId); if (fb) Object.assign(row, fb); } catch (_) {}
    }

    // compute finalPrice on-the-fly if missing using cached FX
    let usdToClp = Number(env.FALLBACK_USD_TO_CLP || env.MANUAL_USD_TO_CLP || 950);
    try {
      const meta = await getUSDtoCLPRateMetaFast(env, db);
      if (meta && Number.isFinite(Number(meta.usdToCLP)) && Number(meta.usdToCLP) > 0) usdToClp = Number(meta.usdToCLP);
    } catch (_) {}
    const defaultMargin = Number(env.DEFAULT_MARGIN_MULTIPLIER || env.VITE_DEFAULT_MARGIN_MULTIPLIER || 1.2);
    const margin = row.marginMultiplier || defaultMargin;
    const ref = Number(row.referencePrice) || Number(row.priceMarket) || Number(row.priceMid) || Number(row.priceLow) || 0;
    let finalPrice = Number(row.finalPrice) || 0;
    let priceComputed = false;
    if ((!finalPrice || finalPrice <= 0) && ref > 0) {
      finalPrice = Math.round(ref * margin * usdToClp);
      priceComputed = true;
    }

    if (!row.cardName) row.cardName = row.externalId || row.cardId || null;
    const externalId = row.externalId || (row.cardId ? String(row.cardId).split(':').pop() : null);
    const cardObj = {
      id: externalId || null,
      tcgId: row.tcg || null,
      tcg: { id: row.tcg || null, name: row.tcg || null, displayName: row.tcg || null },
      editionId: row.editionCode ? `${row.tcg || ''}:${row.editionCode}` : null,
      edition: row.editionCode ? { id: `${row.tcg || ''}:${row.editionCode}`, editionCode: row.editionCode || null, editionName: null, tcgId: row.tcg || null } : null,
      cardCode: row.cardCode || null,
      cardName: row.cardName || null,
      cardNumber: row.cardCode || null,
      rarity: row.rarity || null,
    };
    const out = {
      id: row.listingId || row.id || null,
      cardId: row.cardId || null,
      card: cardObj,
      editionId: cardObj.editionId || (row.editionCode ? `${row.tcg || ''}:${row.editionCode}` : null),
      condition: row.condition || 'NM',
      quantity: Number(row.quantity) || 0,
      referencePrice: Number(row.referencePrice) || 0,
      marginMultiplier: Number(row.marginMultiplier) || defaultMargin,
      finalPrice,
      currency: 'CLP',
      status: row.status || 'active',
      lastSyncedAt: row.lastSyncedAt || null,
      priceComputed,
      stockAlert: Number(row.quantity || 0) <= Number(env.STOCK_ALERT_THRESHOLD || env.VITE_STOCK_ALERT_THRESHOLD || 2),
    };
    // Return both wrapper and top-level fields for compatibility with clients expecting either shape
    const payload = Object.assign({ success: true, listing: out }, out);
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
