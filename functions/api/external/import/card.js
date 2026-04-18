import { getGroups, getGroupProducts, getGroupPrices } from '../../../_shared/tcgcsv.js';
import { pickDb, ensureSchema, buildSelectColumns, aliasSelectColumn } from '../../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const tcg = String((body.tcg || '').toUpperCase()).trim();
    const cardId = String(body.cardId || body.externalId || '').trim();
    const createListing = body.createListing === undefined ? true : !!body.createListing;
    const marginMultiplier = typeof body.marginMultiplier === 'number' ? body.marginMultiplier : (Number(body.marginMultiplier) || 1.0);
    const initialQuantity = Number.isFinite(Number(body.quantity)) ? Number(body.quantity) : 0;

    if (!tcg || !cardId) {
      return new Response(JSON.stringify({ success: false, error: 'tcg and cardId are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const db = pickDb(env);
    if (db) {
      await ensureSchema(db);
    }

    // find the product in TCGCSV
    let groups;
    try {
      groups = await getGroups(tcg);
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: 'TCGCSV getGroups failed', detail: String(e) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
    let found = null;
    let foundGroup = null;
    const numeric = Number(cardId);
    for (const g of groups) {
      let products;
      try {
        products = await getGroupProducts(tcg, g.groupId);
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: 'TCGCSV getGroupProducts failed', detail: String(e) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
      }
      const f = products.find((p) => String(p.productId) === String(cardId) || (numeric && p.productId === numeric));
      if (f) { found = f; foundGroup = g; break; }
    }

    if (!found) {
      return new Response(JSON.stringify({ success: false, error: 'card not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    // Try persisted cache for group prices (appConfig) to reduce external calls
    const ttl = Number(env.EXTERNAL_SET_CACHE_TTL_SECONDS || env.VITE_EXTERNAL_SET_CACHE_TTL_SECONDS || 3600);
    let prices = [];
    if (db) {
      try {
        const cacheRes = await db.prepare('SELECT value FROM appConfig WHERE key = ?').bind(`groupPrices:${tcg}:${foundGroup.groupId}`).all();
        const cacheRow = (Array.isArray(cacheRes?.results) ? cacheRes.results[0] : (Array.isArray(cacheRes) ? cacheRes[0] : null));
        if (cacheRow && cacheRow.value) {
          const parsed = JSON.parse(cacheRow.value);
          if (parsed && parsed.fetchedAt && (Date.now() - new Date(parsed.fetchedAt).getTime()) < (ttl * 1000) && Array.isArray(parsed.data)) {
            prices = parsed.data;
          }
        }
      } catch (_) {}
    }
    if (!prices || prices.length === 0) {
      try {
        prices = await getGroupPrices(tcg, foundGroup.groupId);
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: 'TCGCSV getGroupPrices failed', detail: String(e) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
      }
      if (db) {
        try {
          await db.prepare('INSERT OR REPLACE INTO appConfig (key, value) VALUES (?, ?)').bind(`groupPrices:${tcg}:${foundGroup.groupId}`, JSON.stringify({ fetchedAt: new Date().toISOString(), data: prices })).run();
        } catch (_) {}
      }
    }
    const matchingPrices = prices.filter((pr) => String(pr.productId) === String(found.productId));
    const best = matchingPrices.sort((a,b) => (b.marketPrice ?? b.midPrice ?? b.lowPrice ?? -1) - (a.marketPrice ?? a.midPrice ?? a.lowPrice ?? -1))[0];

    const editionCode = (foundGroup.abbreviation || String(foundGroup.groupId)).toUpperCase();
    const cardKey = `${tcg}:${found.productId}`;

      if (db) {
        await db.prepare(`INSERT OR REPLACE INTO card (id, externalId, tcg, editionCode, cardCode, cardName, rarity, imageUrl, priceMarket) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`)
        .bind(cardKey, String(found.productId), tcg, editionCode, found.name, found.name, found.subTypeName || null, found.imageUrl || null, best ? (best.marketPrice ?? best.midPrice ?? best.lowPrice) : null)
        .run();

      let createdListing = false;
      if (createListing) {
        const listingIdSelect = await buildSelectColumns(db, 'listing', 'l', ['id']);
        const listingIdSelectAliased = aliasSelectColumn(listingIdSelect, 'l', 'id', 'listingId');
        const exist = await db.prepare(`SELECT ${listingIdSelectAliased} FROM listing l WHERE l.cardId = ? AND l.editionCode = ?`).bind(cardKey, editionCode).all();
        const has = Array.isArray(exist.results) ? exist.results.length > 0 : (Array.isArray(exist) ? exist.length > 0 : false);
        if (!has) {
          const listingId = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `L-${Date.now()}-${Math.floor(Math.random()*10000)}`;
          const ref = best ? (best.marketPrice ?? best.midPrice ?? best.lowPrice) : 0.5;
          const finalPrice = Math.round(ref * marginMultiplier * Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || 1000));
          await db.prepare('INSERT INTO listing (id, cardId, editionCode, referencePrice, marginMultiplier, finalPrice, quantity, status, lastSyncedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(listingId, cardKey, editionCode, ref, marginMultiplier, finalPrice, initialQuantity, 'active', new Date().toISOString()).run();
          createdListing = true;
        }
      }

      return new Response(JSON.stringify({ success: true, createdListing }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
