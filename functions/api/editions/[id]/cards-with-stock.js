import { pickDb, ensureSchema, firstRow } from '../../../../_shared/d1.js';

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

    // Fetch cards for this edition
    const cardsRes = await db.prepare('SELECT id, externalId, tcg, editionCode, cardCode, cardName, rarity, imageUrl, priceMarket FROM card WHERE tcg = ? AND editionCode = ? ORDER BY cardCode ASC, cardName ASC').bind(tcg, editionCode).all();
    const cardsRows = Array.isArray(cardsRes?.results) ? cardsRes.results : (Array.isArray(cardsRes) ? cardsRes : []);

    const cardsOut = [];
    for (const c of cardsRows) {
      const cardId = c.id;
      const lres = await db.prepare('SELECT id, condition, quantity, referencePrice, marginMultiplier, finalPrice, currency, lastSyncedAt, status FROM listing WHERE cardId = ? AND editionCode = ?').bind(cardId, editionCode).all();
      let listings = Array.isArray(lres?.results) ? lres.results : (Array.isArray(lres) ? lres : []);

      // If no listings, create a default one
      if (!listings || listings.length === 0) {
        const newId = uuid();
        try {
          await db.prepare('INSERT OR IGNORE INTO listing (id, cardId, editionCode, referencePrice, marginMultiplier, finalPrice, quantity, status, lastSyncedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(newId, cardId, editionCode, 0, Number(env.DEFAULT_MARGIN_MULTIPLIER || env.VITE_DEFAULT_MARGIN_MULTIPLIER || 1.2), 0, 0, 'active', null)
            .run();
          listings = [{ id: newId, condition: 'NM', quantity: 0, referencePrice: 0, marginMultiplier: Number(env.DEFAULT_MARGIN_MULTIPLIER || env.VITE_DEFAULT_MARGIN_MULTIPLIER || 1.2), finalPrice: 0, currency: 'CLP', lastSyncedAt: null, status: 'active' }];
        } catch (_) {
          listings = [];
        }
      }

      cardsOut.push({
        id: c.id,
        cardCode: c.cardCode || c.externalId,
        cardName: c.cardName,
        cardNumber: c.cardCode || null,
        rarity: c.rarity || null,
        colorIdentity: null,
        imageUrl: c.imageUrl || null,
        tags: null,
        listings: listings.map((l) => ({ id: l.id, condition: l.condition || 'NM', quantity: l.quantity ?? 0, referencePrice: l.referencePrice ?? 0, marginMultiplier: l.marginMultiplier ?? Number(env.DEFAULT_MARGIN_MULTIPLIER || env.VITE_DEFAULT_MARGIN_MULTIPLIER || 1.2), finalPrice: l.finalPrice ?? 0, currency: l.currency || 'CLP', lastSyncedAt: l.lastSyncedAt || null, status: l.status || 'active' })),
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
