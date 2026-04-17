import { pickDb, ensureSchema, firstRow } from '../../_shared/d1.js';
import { getUSDtoCLPRateMetaFast } from '../../_shared/exchange-rate.js';

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

    const res = await db.prepare('SELECT l.id as listingId, l.quantity, l.editionCode, l.cardId FROM listing l WHERE l.quantity <= ? ORDER BY l.quantity ASC LIMIT ?')
      .bind(threshold, limit).all();
    const rows = Array.isArray(res.results) ? res.results : (Array.isArray(res) ? res : []);

    const out = [];
    for (const r of rows) {
      let card = null;
      try { card = await findCardFallback(db, r.cardId); } catch (_) { card = null; }
      const qty = Number(r.quantity || 0);
      const listing = await db.prepare('SELECT referencePrice, marginMultiplier, finalPrice FROM listing WHERE id = ?').bind(r.listingId).all().catch(() => null);
      const lrow = Array.isArray(listing?.results) ? listing.results[0] : (Array.isArray(listing) ? listing[0] : null);
      const listingRef = lrow ? Number(lrow.referencePrice || 0) : 0;
      const cardPrice = card ? (Number(card.priceMarket || card.priceMid || card.priceLow) || 0) : 0;
      const ref = listingRef || cardPrice;
      const margin = lrow ? (lrow.marginMultiplier || defaultMargin) : defaultMargin;
      let finalPrice = lrow ? Number(lrow.finalPrice || 0) : 0;
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
