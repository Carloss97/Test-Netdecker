import { pickDb, ensureSchema, firstRow, buildSelectColumns } from '../../../_shared/d1.js';
import { getUSDtoCLPRateMetaFast } from '../../../_shared/exchange-rate.js';

function uuid() {
  if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  return `L-${Date.now()}-${Math.floor(Math.random()*100000)}`;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const id = params.id;
    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ error: 'No DB bound' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    const edRes = await db.prepare('SELECT id, tcg, editionCode, editionName, releaseDate FROM edition WHERE id = ?').bind(id).all();
    const ed = firstRow(edRes);
    if (!ed) return new Response(JSON.stringify({ error: 'Edition not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    const tcg = ed.tcg;
    const editionCode = ed.editionCode;

    // Fetch cards for this edition (build select dynamically to avoid missing columns)
    const cardSelect = await buildSelectColumns(db, 'card', 'c', ['id','externalId','tcg','editionCode','cardCode','cardName','rarity','imageUrl','priceMarket','priceMid','priceLow']);
    const cardsRes = await db.prepare(`SELECT ${cardSelect} FROM card c WHERE c.tcg = ? AND c.editionCode = ? ORDER BY c.cardCode ASC, c.cardName ASC`).bind(tcg, editionCode).all();
    const cardsRows = Array.isArray(cardsRes?.results) ? cardsRes.results : (Array.isArray(cardsRes) ? cardsRes : []);

    // fast FX read for computing CLP prices when finalPrice missing
    let usdToClp = Number(env.FALLBACK_USD_TO_CLP || env.MANUAL_USD_TO_CLP || 950);
    try {
      const meta = await getUSDtoCLPRateMetaFast(env, db);
      if (meta && Number.isFinite(Number(meta.usdToCLP)) && Number(meta.usdToCLP) > 0) usdToClp = Number(meta.usdToCLP);
    } catch (_) {}

    const defaultMargin = Number(env.DEFAULT_MARGIN_MULTIPLIER || env.VITE_DEFAULT_MARGIN_MULTIPLIER || 1.2);
    const stockAlertThreshold = Number(env.STOCK_ALERT_THRESHOLD || env.VITE_STOCK_ALERT_THRESHOLD || 2);

    // Prefetch listings for all cards in this edition to avoid N+1 queries
    const chunk = (arr, size) => { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };
    const cardIds = cardsRows.map((c) => c.id);
    const listingMap = new Map(); // cardId -> [listings]
    for (const chunked of chunk(cardIds, 50)) {
      const placeholders = chunked.map(() => '?').join(',');
      try {
        const sel = await db.prepare(`SELECT id, cardId, condition, quantity, referencePrice, marginMultiplier, finalPrice, lastSyncedAt, status FROM listing WHERE editionCode = ? AND cardId IN (${placeholders})`).bind(editionCode, ...chunked).all();
        const rowsRes = Array.isArray(sel?.results) ? sel.results : (Array.isArray(sel) ? sel : []);
        for (const r of rowsRes) {
          const key = r.cardId || r.cardID || r.cardid || r.cardId;
          const arr = listingMap.get(key) || [];
          arr.push(r);
          listingMap.set(key, arr);
        }
      } catch (_) {
        // ignore errors and continue
      }
    }

    const cardsOut = [];
    for (const c of cardsRows) {
      const listings = listingMap.get(c.id) || [];
      const mapped = listings.map((l) => {
        const margin = l.marginMultiplier || defaultMargin;
        const ref = Number(l.referencePrice) || Number(c.priceMarket) || Number(c.priceMid) || Number(c.priceLow) || 0;
        let finalPrice = Number(l.finalPrice) || 0;
        let priceComputed = false;
        if ((!finalPrice || finalPrice <= 0) && ref > 0) {
          finalPrice = Math.round(ref * margin * usdToClp);
          priceComputed = true;
        }
        return { id: l.id, condition: l.condition || 'NM', quantity: l.quantity ?? 0, referencePrice: ref, marginMultiplier: margin, finalPrice, currency: 'CLP', lastSyncedAt: l.lastSyncedAt || null, status: l.status || 'active', priceComputed, stockAlert: Number(l.quantity || 0) <= stockAlertThreshold };
      });

      cardsOut.push({
        id: c.id,
        cardCode: c.cardCode || c.externalId,
        cardName: c.cardName,
        cardNumber: c.cardCode || null,
        rarity: c.rarity || null,
        colorIdentity: null,
        imageUrl: c.imageUrl || null,
        tags: null,
        listings: mapped,
      });
    }

    const cardsWithStock = cardsOut.filter((c) => (c.listings?.some((l) => l.quantity > 0))).length;

    return new Response(JSON.stringify({
      edition: { id: ed.id, editionCode: ed.editionCode, editionName: ed.editionName, releaseDate: ed.releaseDate, tcgId: ed.tcg, tcg: { id: ed.tcg, name: ed.tcg, displayName: ed.tcg } },
      totalCards: cardsOut.length,
      cardsWithStock,
      cards: cardsOut,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
