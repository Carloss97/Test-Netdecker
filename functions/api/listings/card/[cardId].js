import { pickDb, ensureSchema, buildSelectColumns, aliasSelectColumn } from '../../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const { cardId } = params || {};
    if (!cardId) return new Response(JSON.stringify({ success: false, error: 'cardId missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    // cardId may be externalId (numeric/string) or composite id like TCG:123
    const cardCols = await buildSelectColumns(db, 'card', 'c', ['cardName','externalId','tcg','rarity']);
    const selectCard = cardCols;

    // build safe listing select to tolerate older D1 schemas
    const listingCols = await buildSelectColumns(db, 'listing', 'l', ['id','cardId','editionCode','referencePrice','marginMultiplier','finalPrice','quantity','status','lastSyncedAt']);
    let listingSelect = listingCols;
    listingSelect = aliasSelectColumn(listingSelect, 'l', 'id', 'listingId');
    listingSelect = aliasSelectColumn(listingSelect, 'l', 'editionCode', 'editionCode');

    // Order by output aliases to avoid runtime failures when physical columns are missing
    const sql = `SELECT ${listingSelect}, ${selectCard} FROM listing l LEFT JOIN card c ON l.cardId = c.id WHERE c.externalId = ? OR c.id = ? OR l.cardId = ? ORDER BY quantity DESC, finalPrice ASC`;
    const res = await db.prepare(sql).bind(cardId, cardId, cardId).all();
    const rows = Array.isArray(res.results) ? res.results : (Array.isArray(res) ? res : []);
    const out = [];
    for (const r of rows) {
      const externalId = r.externalId || (r.cardId ? String(r.cardId).split(':').pop() : null);
      const cardObj = {
        id: externalId || null,
        tcgId: r.tcg || null,
        tcg: { id: r.tcg || null, name: r.tcg || null, displayName: r.tcg || null },
        editionId: r.editionCode ? `${r.tcg || ''}:${r.editionCode}` : null,
        edition: r.editionCode ? { id: `${r.tcg || ''}:${r.editionCode}`, editionCode: r.editionCode || null, editionName: null, tcgId: r.tcg || null } : null,
        cardCode: r.cardCode || null,
        cardName: r.cardName || null,
        cardNumber: r.cardCode || null,
        rarity: r.rarity || null,
      };
      const margin = Number(r.marginMultiplier || 1.0);
      const ref = Number(r.referencePrice) || Number(r.priceMarket) || Number(r.priceMid) || Number(r.priceLow) || 0;
      let finalPrice = Number(r.finalPrice) || 0;
      let priceComputed = false;
      if ((!finalPrice || finalPrice <= 0) && ref > 0) {
        // best-effort: use FALLBACK_USD_TO_CLP env if available
        const usdToClp = Number(env.FALLBACK_USD_TO_CLP || env.MANUAL_USD_TO_CLP || 1000);
        finalPrice = Math.round(ref * margin * usdToClp);
        priceComputed = true;
      }
      out.push({
        id: r.listingId || r.id || null,
        cardId: r.cardId || null,
        card: cardObj,
        editionId: cardObj.editionId || null,
        condition: r.condition || 'NM',
        quantity: Number(r.quantity) || 0,
        referencePrice: Number(r.referencePrice) || 0,
        marginMultiplier: Number(r.marginMultiplier) || 1.0,
        finalPrice,
        currency: 'CLP',
        status: r.status || 'active',
        lastSyncedAt: r.lastSyncedAt || null,
        priceComputed,
      });
    }
    return new Response(JSON.stringify({ success: true, total: out.length, listings: out }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
