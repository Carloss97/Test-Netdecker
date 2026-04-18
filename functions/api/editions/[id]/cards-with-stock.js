import { pickDb, ensureSchema, firstRow, buildSelectColumns } from '../../../_shared/d1.js';
import { getUSDtoCLPRateMetaFast } from '../../../_shared/exchange-rate.js';

// Fallback to locate card metadata when JOINs fail or older D1 schemas lack columns
async function findCardFallback(db, cardId) {
  if (!cardId) return null;
  try {
    const cardCols = await buildSelectColumns(db, 'card', 'c', ['cardName','externalId','tcg','editionCode','cardCode','imageUrl','priceMarket','priceMid','priceLow','rarity']);
    // try by id
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

    const editionCols = await buildSelectColumns(db, 'edition', 'e', ['id','tcg','editionCode','editionName','releaseDate']);
    let edRes = await db.prepare(`SELECT ${editionCols} FROM edition e WHERE e.id = ?`).bind(id).all();
    let ed = firstRow(edRes);
    if (!ed) {
      try {
        const decoded = decodeURIComponent(String(id));
        const parts = String(decoded).split(':').filter(Boolean);
        if (parts.length >= 2) {
          const tcg = parts[0].toUpperCase();
          const maybeCode = parts.slice(1).join(':').toUpperCase();
          edRes = await db.prepare(`SELECT ${editionCols} FROM edition e WHERE e.tcg = ? AND upper(e.editionCode) = ? LIMIT 1`).bind(tcg, maybeCode).all();
          ed = firstRow(edRes);
        }
      } catch (_) {}
    }
    if (!ed) {
      try {
        const codeOnly = String(id).includes(':') ? String(id).split(':').pop() : String(id);
        edRes = await db.prepare(`SELECT ${editionCols} FROM edition e WHERE upper(e.editionCode) = ? LIMIT 1`).bind(String(codeOnly).toUpperCase()).all();
        ed = firstRow(edRes);
      } catch (_) {}
    }
    if (!ed) return new Response(JSON.stringify({ error: 'Edition not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    const tcg = ed.tcg;
    const editionCode = ed.editionCode;

    // Fetch cards for this edition (build select dynamically to avoid missing columns)
    const cardSelect = await buildSelectColumns(db, 'card', 'c', ['id','externalId','tcg','editionCode','cardCode','cardName','rarity','imageUrl','priceMarket','priceMid','priceLow']);
    const cardsRes = await db.prepare(`SELECT ${cardSelect} FROM card c WHERE c.tcg = ? AND c.editionCode = ? ORDER BY cardCode ASC, cardName ASC`).bind(tcg, editionCode).all();
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
    const listingSelectCols = await buildSelectColumns(db, 'listing', 'l', ['id','cardId','condition','quantity','referencePrice','marginMultiplier','finalPrice','lastSyncedAt','status']);
    for (const chunked of chunk(cardIds, 50)) {
      const placeholders = chunked.map(() => '?').join(',');
      try {
        // Primary query: prefer editionCode-scoped listings
        let sel = await db.prepare(`SELECT ${listingSelectCols} FROM listing l WHERE l.editionCode = ? AND l.cardId IN (${placeholders})`).bind(editionCode, ...chunked).all();
        let rowsRes = Array.isArray(sel?.results) ? sel.results : (Array.isArray(sel) ? sel : []);

        // Fallback: sometimes listings may not have editionCode populated consistently; try by cardId only
        if ((!rowsRes || rowsRes.length === 0)) {
          try {
            sel = await db.prepare(`SELECT ${listingSelectCols} FROM listing l WHERE l.cardId IN (${placeholders})`).bind(...chunked).all();
            rowsRes = Array.isArray(sel?.results) ? sel.results : (Array.isArray(sel) ? sel : []);
          } catch (_) {
            rowsRes = [];
          }
        }

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
      // If card metadata is missing due to schema differences or failed JOINs,
      // try a fallback lookup to populate cardName, cardCode, rarity, etc.
      if (!c.cardName || !c.cardCode || !c.rarity) {
        try {
          const fb = await findCardFallback(db, c.id);
          if (fb) {
            c.cardName = fb.cardName || c.cardName;
            c.externalId = fb.externalId || c.externalId;
            c.tcg = fb.tcg || c.tcg;
            c.rarity = fb.rarity || c.rarity;
            c.priceMarket = fb.priceMarket || c.priceMarket;
            c.priceMid = fb.priceMid || c.priceMid;
            c.priceLow = fb.priceLow || c.priceLow;
            c.cardCode = fb.cardCode || c.cardCode;
            c.imageUrl = fb.imageUrl || c.imageUrl;
          }
        } catch (_) {}
      }
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
