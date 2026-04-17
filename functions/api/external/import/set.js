import { getGroups, getGroupProducts, getGroupPrices } from '../../../_shared/tcgcsv.js';
import { pickDb, ensureSchema, firstRow } from '../../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const payload = (request.method === 'GET')
      ? Object.fromEntries(new URL(request.url).searchParams.entries())
      : await request.json().catch(() => ({}));

    const tcg = String((payload.tcg || payload.tcg || '').toUpperCase() || '').trim();
    const setCode = String(payload.setCode || payload.code || payload.set || '').trim();
    const createListing = payload.createListing === undefined ? true : !!payload.createListing;
    const marginMultiplier = typeof payload.marginMultiplier === 'number' ? payload.marginMultiplier : (Number(payload.marginMultiplier) || 1.2);
    const initialQuantity = Number.isFinite(Number(payload.initialQuantity)) ? Number(payload.initialQuantity) : 0;

    if (!tcg || !setCode) {
      return new Response(JSON.stringify({ success: false, error: 'tcg and setCode are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const db = pickDb(env);
    if (db) await ensureSchema(db);

    // Resolve group first to expose edition metadata
    const groups = await getGroups(tcg).catch(() => []);
    const resolved = groups.find((g) => {
      const abbr = (g.abbreviation || '').toUpperCase();
      if (abbr === setCode.toUpperCase()) return true;
      if (String(g.groupId) === setCode) return true;
      return false;
    });

    if (!resolved) {
      return new Response(JSON.stringify({ success: false, error: 'set not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const editionCode = (resolved.abbreviation || String(resolved.groupId)).toUpperCase();
    const editionId = `${tcg}:${editionCode}`;

    if (db) {
      await db.prepare(`INSERT OR REPLACE INTO edition (id, tcg, editionCode, editionName, releaseDate, isActive) VALUES (?, ?, ?, ?, ?, ?);`)
        .bind(editionId, tcg, editionCode, resolved.name || '', resolved.publishedOn || null, 1)
        .run();
    }

    // Fetch products and prices for the resolved group (avoid re-calling getGroups inside helper)
    const products = await getGroupProducts(tcg, resolved.groupId).catch(() => []);
    const prices = await getGroupPrices(tcg, resolved.groupId).catch(() => []);

    // Build price map (best price per productId)
    const priceByProductId = new Map();
    for (const p of prices) {
      const existing = priceByProductId.get(p.productId);
      if (!existing) {
        priceByProductId.set(p.productId, p);
        continue;
      }
      const candidates = [existing, p];
      candidates.sort((a, b) => (b.marketPrice ?? b.midPrice ?? b.lowPrice ?? -1) - (a.marketPrice ?? a.midPrice ?? a.lowPrice ?? -1));
      priceByProductId.set(p.productId, candidates[0]);
    }

    const cards = (products || []).filter((product) => {
      const ext = product.extendedData || [];
      return ext.some((entry) => {
        const key = (entry.name || entry.displayName || '').toLowerCase();
        return key === 'rarity' || key === 'number' || key === 'cardnumber' || key === 'collectornumber';
      });
    }).map((product) => {
      const ext = product.extendedData || [];
      const getExt = (k) => {
        const found = ext.find((e) => ((e.name || e.displayName) || '').toLowerCase() === String(k).toLowerCase());
        return found ? found.value : undefined;
      };
      const price = priceByProductId.get(product.productId);
      const priceMarket = price ? (price.marketPrice ?? price.midPrice ?? price.lowPrice) : null;
      return {
        externalId: String(product.productId),
        tcg,
        cardName: product.name,
        cardNumber: getExt('number') || getExt('cardnumber') || getExt('collectornumber') || null,
        rarity: getExt('rarity') || product.subTypeName || null,
        imageUrl: product.imageUrl || null,
        priceLow: price?.lowPrice ?? null,
        priceMid: price?.midPrice ?? null,
        priceMarket: priceMarket ?? null,
      };
    });

    const usdToClp = Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || 950);

    const results = [];
    let createdCards = 0;
    let updatedCards = 0;
    let createdListings = 0;

    if (db && cards.length > 0) {
      // Preload existing cards and listings to avoid per-card SELECTs
      const cardIds = cards.map((c) => `${tcg}:${c.externalId}`);
      const chunk = (arr, size) => { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };

      const rowsFrom = (res) => {
        if (!res) return [];
        if (Array.isArray(res.results)) return res.results;
        if (Array.isArray(res)) return res;
        return [];
      };

      // Query existing cards in chunks
      const existingCardIds = new Set();
      for (const cids of chunk(cardIds, 150)) {
        const placeholders = cids.map(() => '?').join(',');
        const sel = await db.prepare(`SELECT id FROM card WHERE id IN (${placeholders})`).bind(...cids).all();
        for (const r of rowsFrom(sel)) existingCardIds.add(r.id || r.ID || r.id);
      }

      // Query existing listings for this edition
      const existingListingCardIds = new Set();
      for (const cids of chunk(cardIds, 150)) {
        const placeholders = cids.map(() => '?').join(',');
        const sel = await db.prepare(`SELECT id, cardId FROM listing WHERE editionCode = ? AND cardId IN (${placeholders})`).bind(editionCode, ...cids).all();
        for (const r of rowsFrom(sel)) existingListingCardIds.add(r.cardId || r.cardid || r.cardID || r.cardId);
      }

      const cardStmt = db.prepare(`INSERT OR REPLACE INTO card (id, externalId, tcg, editionCode, cardCode, cardName, rarity, imageUrl, priceMarket) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`);
      const listingStmt = db.prepare(`INSERT OR IGNORE INTO listing (id, cardId, editionCode, referencePrice, marginMultiplier, finalPrice, quantity, status, lastSyncedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`);
      const priceHistoryStmt = db.prepare('INSERT INTO priceHistory (id, listingId, oldPrice, newPrice, oldReferencePrice, newReferencePrice, oldExchangeRate, newExchangeRate, reason, percentChange, changedBy, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

      for (const c of cards) {
        const cardId = `${tcg}:${c.externalId}`;
        const existed = existingCardIds.has(cardId);

        await cardStmt.bind(cardId, c.externalId, tcg, editionCode, c.cardNumber || c.externalId, c.cardName || '', c.rarity || null, c.imageUrl || null, c.priceMarket || null).run();

        if (existed) updatedCards += 1; else { createdCards += 1; existingCardIds.add(cardId); }

        if (createListing && !existingListingCardIds.has(cardId)) {
          const listingId = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `L-${Date.now()}-${Math.floor(Math.random()*10000)}`;
          const ref = typeof c.priceMarket === 'number' && c.priceMarket > 0 ? c.priceMarket : (c.priceMid || c.priceLow || 0.5);
          const finalPrice = Math.round(ref * marginMultiplier * usdToClp);
          try {
            await listingStmt.bind(listingId, cardId, editionCode, ref, marginMultiplier, finalPrice, initialQuantity, 'active', new Date().toISOString()).run();
            createdListings += 1;
          } catch (e) {
            // ignore insert errors (unique constraint, race conditions), do not fail whole import
          }
          existingListingCardIds.add(cardId);

          // Insert initial price history
          const phId = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `PH-${Date.now()}-${Math.floor(Math.random()*10000)}`;
          await priceHistoryStmt.bind(phId, listingId, null, finalPrice, null, ref, null, usdToClp, 'initial_import', null, 'import', '', new Date().toISOString()).run();
        }

        results.push({ externalId: c.externalId, cardName: c.cardName, priceMarket: c.priceMarket });
      }
    } else {
      // No DB configured — just return inspection results
      for (const p of cards) results.push({ externalId: p.externalId, cardName: p.cardName, priceMarket: p.priceMarket });
    }

    return new Response(JSON.stringify({ success: true, total: cards.length, createdCards, updatedCards, createdListings, results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
