import { pickDb, ensureSchema, firstRow } from '../../../_shared/d1.js';
import { getUSDtoCLPRateMetaFast } from '../../../_shared/exchange-rate.js';

async function findCardFallback(db, cardId) {
  if (!cardId) return null;
  try {
    const r1 = await db.prepare('SELECT cardName, externalId, tcg, editionCode, cardCode, imageUrl, priceMarket, priceMid, priceLow FROM card WHERE id = ?').bind(cardId).all();
    const row1 = firstRow(r1);
    if (row1) return row1;
    const parts = String(cardId).split(':').filter(Boolean);
    if (parts.length >= 2) {
      const tcg = parts[0];
      const maybe = parts[parts.length - 1];
      const r2 = await db.prepare('SELECT cardName, externalId, tcg, editionCode, cardCode, imageUrl, priceMarket, priceMid, priceLow FROM card WHERE tcg = ? AND (externalId = ? OR cardCode = ? OR id = ?) LIMIT 1')
        .bind(tcg, maybe, maybe, `${tcg}:${maybe}`).all();
      const row2 = firstRow(r2);
      if (row2) return row2;
      const r3 = await db.prepare('SELECT cardName, externalId, tcg, editionCode, cardCode, imageUrl, priceMarket, priceMid, priceLow FROM card WHERE externalId = ? LIMIT 1').bind(maybe).all();
      const row3 = firstRow(r3);
      if (row3) return row3;
    }
    const last = String(cardId).slice(-10);
    const r4 = await db.prepare('SELECT cardName, externalId, tcg, editionCode, cardCode, imageUrl, priceMarket, priceMid, priceLow FROM card WHERE cardName LIKE ? LIMIT 1').bind(`%${last}%`).all();
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

    const res = await db.prepare('SELECT l.id as listingId, l.cardId, l.editionCode, l.referencePrice, l.marginMultiplier, l.finalPrice, l.quantity, l.status, l.lastSyncedAt, c.cardName, c.externalId, c.tcg, c.rarity, c.priceMarket, c.priceMid, c.priceLow FROM listing l LEFT JOIN card c ON l.cardId = c.id WHERE l.id = ?')
      .bind(id).all();
    let row = Array.isArray(res.results) ? res.results[0] : (Array.isArray(res) ? res[0] : null);
    if (!row) {
      // Try to fetch listing only and allow returning with fallback card info
      const lr = await db.prepare('SELECT id as listingId, cardId, editionCode, referencePrice, marginMultiplier, finalPrice, quantity, status, lastSyncedAt FROM listing WHERE id = ?').bind(id).all();
      row = Array.isArray(lr.results) ? lr.results[0] : (Array.isArray(lr) ? lr[0] : null);
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
    const out = { ...row, finalPrice, priceComputed, stockAlert: Number(row.quantity || 0) <= Number(env.STOCK_ALERT_THRESHOLD || env.VITE_STOCK_ALERT_THRESHOLD || 2) };
    return new Response(JSON.stringify({ success: true, listing: out }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
