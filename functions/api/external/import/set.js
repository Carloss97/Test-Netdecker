import { getSetCards, getGroups } from '../../../_shared/tcgcsv.js';
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

    const cards = await getSetCards(tcg, setCode).catch(() => []);

    const usdToClp = Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || 950);

    const results = [];
    let createdCards = 0;
    let updatedCards = 0;
    let createdListings = 0;

    for (const c of cards) {
      const cardId = `${tcg}:${c.externalId}`;
      if (db) {
        const existsRes = await db.prepare('SELECT id FROM card WHERE id = ?').bind(cardId).all();
        const exists = Array.isArray(existsRes.results) ? existsRes.results.length > 0 : (Array.isArray(existsRes) ? existsRes.length > 0 : false);

        await db.prepare(`INSERT OR REPLACE INTO card (id, externalId, tcg, editionCode, cardCode, cardName, rarity, imageUrl, priceMarket) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`)
          .bind(cardId, c.externalId, tcg, editionCode, c.cardNumber || c.externalId, c.cardName || '', c.rarity || null, c.imageUrl || null, c.priceMarket || null)
          .run();

        if (exists) updatedCards += 1; else createdCards += 1;

        if (createListing) {
          // create listing only if none exists for this card+edition
          const listingExists = await db.prepare('SELECT id FROM listing WHERE cardId = ? AND editionCode = ?').bind(cardId, editionCode).all();
          const hasListing = Array.isArray(listingExists.results) ? listingExists.results.length > 0 : (Array.isArray(listingExists) ? listingExists.length > 0 : false);
          if (!hasListing) {
            const listingId = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `L-${Date.now()}-${Math.floor(Math.random()*10000)}`;
            const ref = typeof c.priceMarket === 'number' && c.priceMarket > 0 ? c.priceMarket : (c.priceMid || c.priceLow || 0.5);
            const finalPrice = Math.round(ref * marginMultiplier * usdToClp);
            await db.prepare(`INSERT INTO listing (id, cardId, editionCode, referencePrice, marginMultiplier, finalPrice, quantity, status, lastSyncedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`)
              .bind(listingId, cardId, editionCode, ref, marginMultiplier, finalPrice, initialQuantity, 'active', new Date().toISOString())
              .run();
            createdListings += 1;
          }
        }
      }

      results.push({ externalId: c.externalId, cardName: c.cardName, priceMarket: c.priceMarket });
    }

    return new Response(JSON.stringify({ success: true, total: cards.length, createdCards, updatedCards, createdListings, results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
