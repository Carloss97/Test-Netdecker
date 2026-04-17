import { getGroups, getGroupProducts, getGroupPrices } from '../../../_shared/tcgcsv.js';
import { pickDb, ensureSchema, buildSelectColumns } from '../../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const tcgRaw = String((body.tcg || '').toUpperCase() || '').trim();
    const query = String(body.query || body.q || '').trim();
    const createListing = body.createListing === undefined ? true : !!body.createListing;
    const marginMultiplier = typeof body.marginMultiplier === 'number' ? body.marginMultiplier : (Number(body.marginMultiplier) || 1.2);
    const initialQuantity = Number.isFinite(Number(body.quantity)) ? Number(body.quantity) : 0;
    const limit = Math.min(200, Math.max(1, parseInt(String(body.limit || '50'), 10)));

    if (!query) {
      return new Response(JSON.stringify({ success: false, error: 'query is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const supported = ['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON', 'WEISS_SCHWARZ'];
    const tcgsToSearch = tcgRaw && supported.includes(tcgRaw) ? [tcgRaw] : supported;

    const db = pickDb(env);
    if (db) await ensureSchema(db);

    const lowerQ = query.toLowerCase();
    const foundCards = [];

    for (const tcg of tcgsToSearch) {
      let groups;
      try {
        groups = await getGroups(tcg);
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: 'TCGCSV getGroups failed', detail: String(e) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
      }
      for (const g of groups) {
        const products = await getGroupProducts(tcg, g.groupId).catch(() => []);
        for (const p of (products || [])) {
          if (!p || !p.name) continue;
          if (p.name.toLowerCase().includes(lowerQ)) {
            const prices = await getGroupPrices(tcg, g.groupId).catch(() => []);
            const matchingPrices = prices.filter((pr) => String(pr.productId) === String(p.productId));
            const best = matchingPrices.sort((a,b) => (b.marketPrice ?? b.midPrice ?? b.lowPrice ?? -1) - (a.marketPrice ?? a.midPrice ?? a.lowPrice ?? -1))[0];

            const editionCode = (g.abbreviation || String(g.groupId)).toUpperCase();
            const cardKey = `${tcg}:${p.productId}`;

            if (db) {
              await db.prepare(`INSERT OR REPLACE INTO card (id, externalId, tcg, editionCode, cardCode, cardName, rarity, imageUrl, priceMarket) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`)
                .bind(cardKey, String(p.productId), tcg, editionCode, p.name, p.name, p.subTypeName || null, p.imageUrl || null, best ? (best.marketPrice ?? best.midPrice ?? best.lowPrice) : null)
                .run();

              if (createListing) {
                const listingIdSelect = await buildSelectColumns(db, 'listing', 'l', ['id']);
                const exist = await db.prepare(`SELECT ${listingIdSelect} FROM listing l WHERE l.cardId = ? AND l.editionCode = ?`).bind(cardKey, editionCode).all();
                const has = Array.isArray(exist.results) ? exist.results.length > 0 : (Array.isArray(exist) ? exist.length > 0 : false);
                if (!has) {
                  const listingId = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `L-${Date.now()}-${Math.floor(Math.random()*10000)}`;
                  const ref = best ? (best.marketPrice ?? best.midPrice ?? best.lowPrice) : 0.5;
                  const finalPrice = Math.round(ref * marginMultiplier * Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || 950));
                  await db.prepare('INSERT INTO listing (id, cardId, editionCode, referencePrice, marginMultiplier, finalPrice, quantity, status, lastSyncedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
                    .bind(listingId, cardKey, editionCode, ref, marginMultiplier, finalPrice, initialQuantity, 'active', new Date().toISOString()).run();
                }
              }
            }

            foundCards.push({ externalId: String(p.productId), tcg, cardName: p.name, editionCode });
            if (foundCards.length >= limit) break;
          }
        }
        if (foundCards.length >= limit) break;
      }
      if (foundCards.length >= limit) break;
    }

    return new Response(JSON.stringify({ success: true, total: foundCards.length, results: foundCards }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
