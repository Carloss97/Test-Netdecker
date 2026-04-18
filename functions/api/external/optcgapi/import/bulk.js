import { getGroups, getSetCards } from '../../../../_shared/tcgcsv.js';
import { pickDb, ensureSchema, buildSelectColumns, aliasSelectColumn } from '../../../../_shared/d1.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const payload = (request.method === 'GET')
      ? Object.fromEntries(new URL(request.url).searchParams.entries())
      : await request.json().catch(() => ({}));

    const createListing = payload.createListing === undefined ? true : !!payload.createListing;
    const marginMultiplier = typeof payload.marginMultiplier === 'number' ? payload.marginMultiplier : (Number(payload.marginMultiplier) || 1.2);
    const initialQuantity = Number.isFinite(Number(payload.quantity)) ? Number(payload.quantity) : 0;

    const tcg = 'ONE_PIECE';
    let sets;
    try { sets = await getGroups(tcg); } catch (err) { return json({ success: false, error: 'TCGCSV getGroups failed', detail: String(err) }, 502); }

    const allCards = [];
    for (const s of sets) {
      try {
        const cards = await getSetCards(tcg, s.abbreviation || String(s.groupId));
        if (Array.isArray(cards) && cards.length) {
          // annotate with edition code
          const editionCode = (s.abbreviation || String(s.groupId)).toUpperCase();
          for (const c of cards) allCards.push({ ...c, editionCode });
        }
      } catch (_) {
        // continue on per-set failure
      }
    }

    if (!allCards || allCards.length === 0) return json({ success: false, error: 'No One Piece cards found in OPTCGAPI' }, 404);

    const db = pickDb(env);
    if (!db) {
      // If no DB configured, return inspection results
      return json({ success: true, source: 'tcgcsv', tcg, totalCards: allCards.length, created: 0, updated: 0, skipped: 0, results: allCards.slice(0, 50) });
    }

    await ensureSchema(db);

    // Reuse the same batching & insert strategy as other import endpoints
    const SQLITE_MAX_VARS = 900;
    const rowsFrom = (res) => { if (!res) return []; if (Array.isArray(res.results)) return res.results; if (Array.isArray(res)) return res; return []; };

    // Preload existing cards and listings
    const cardIds = allCards.map((c) => `${tcg}:${c.externalId}`);
    const chunk = (arr, size) => { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };
    const safeSelectChunk = Math.max(1, Math.min(800, Math.floor(SQLITE_MAX_VARS / 1)));

    const existingCardIds = new Set();
    try {
      const cardIdCols = await buildSelectColumns(db, 'card', 'c', ['id']);
      for (const cids of chunk(cardIds, safeSelectChunk)) {
        const placeholders = cids.map(() => '?').join(',');
        const sel = await db.prepare(`SELECT ${cardIdCols} FROM card c WHERE c.id IN (${placeholders})`).bind(...cids).all();
        for (const r of rowsFrom(sel)) existingCardIds.add(r.id || r.ID || r.Id || r.cardId || r.cardid || r.id);
      }
    } catch (_) {}

    const existingListingCardIds = new Set();
    try {
      const listingCols = await buildSelectColumns(db, 'listing', 'l', ['id','cardId']);
      const listingColsAliasedId = aliasSelectColumn(listingCols, 'l', 'id', 'listingId');
      for (const cids of chunk(cardIds, safeSelectChunk)) {
        const placeholders = cids.map(() => '?').join(',');
        const sel = await db.prepare(`SELECT ${listingColsAliasedId} FROM listing l WHERE l.cardId IN (${placeholders})`).bind(...cids).all();
        for (const r of rowsFrom(sel)) existingListingCardIds.add(r.cardId || r.cardid || r.cardID || r.cardId);
      }
    } catch (_) {}

    // Build rows for batched insert
    const cardRows = [];
    const listingRows = [];
    const priceHistoryRows = [];

    let createdCards = 0;
    let updatedCards = 0;
    let createdListings = 0;

    // Determine usdToClp cache
    let usdToClp = Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || 950);
    try {
      const pc = await db.prepare('SELECT value FROM appConfig WHERE key = ?').bind('exchangeRateCache').all();
      const first = Array.isArray(pc?.results) ? pc.results[0] : (Array.isArray(pc) ? pc[0] : null);
      if (first && first.value) {
        const parsed = JSON.parse(first.value);
        const cached = Number(parsed?.usdToCLP);
        if (!isNaN(cached) && cached > 0) usdToClp = cached;
      }
    } catch (_) {}

    for (const c of allCards) {
      const cardId = `${tcg}:${c.externalId}`;
      const existed = existingCardIds.has(cardId);
      const editionCode = c.editionCode || (c.editionCode || '').toUpperCase();

      cardRows.push([cardId, c.externalId, tcg, editionCode, c.cardNumber || c.externalId, c.cardName || '', c.rarity || null, c.imageUrl || null, c.priceMarket || null]);

      if (existed) updatedCards += 1; else { createdCards += 1; existingCardIds.add(cardId); }

      if (createListing && !existingListingCardIds.has(cardId)) {
        const listingId = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `L-${Date.now()}-${Math.floor(Math.random()*10000)}`;
        const ref = typeof c.priceMarket === 'number' && c.priceMarket > 0 ? c.priceMarket : (c.priceMid || c.priceLow || 0.5);
        const finalPrice = Math.round(ref * marginMultiplier * usdToClp);

        listingRows.push([listingId, cardId, editionCode, ref, marginMultiplier, finalPrice, initialQuantity, 'active', new Date().toISOString()]);

        const phId = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `PH-${Date.now()}-${Math.floor(Math.random()*10000)}`;
        priceHistoryRows.push([phId, listingId, null, finalPrice, null, ref, null, usdToClp, 'initial_import', null, 'import', '', new Date().toISOString()]);

        existingListingCardIds.add(cardId);
        createdListings += 1;
      }
    }

    // Batched insertion helper
    const runBatchedInsert = async (tableCols, rows, orReplace = false, orIgnore = false) => {
      if (!rows || rows.length === 0) return;
      const colCount = tableCols.cols.length;
      const safeBatch = Math.max(1, Math.floor(SQLITE_MAX_VARS / Math.max(1, colCount)));
      const batches = (arr, size) => { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };
      for (const batch of batches(rows, safeBatch)) {
        const placeholders = batch.map(() => `(${new Array(colCount).fill('?').join(',')})`).join(',');
        const sql = `INSERT ${orReplace ? 'OR REPLACE' : orIgnore ? 'OR IGNORE' : ''} INTO ${tableCols.table} (${tableCols.cols.join(',')}) VALUES ${placeholders};`;
        const params = batch.flat();
        try { await db.prepare(sql).bind(...params).run(); } catch (e) {
          // fallback per-row
          for (const row of batch) {
            try { await db.prepare(`INSERT ${orReplace ? 'OR REPLACE' : orIgnore ? 'OR IGNORE' : ''} INTO ${tableCols.table} (${tableCols.cols.join(',')}) VALUES (${new Array(colCount).fill('?').join(',')});`).bind(...row).run(); } catch (_) {}
          }
        }
      }
    };

    // Insert cards
    await runBatchedInsert({ table: 'card', cols: ['id','externalId','tcg','editionCode','cardCode','cardName','rarity','imageUrl','priceMarket'] }, cardRows, true, false);
    // Insert listings
    await runBatchedInsert({ table: 'listing', cols: ['id','cardId','editionCode','referencePrice','marginMultiplier','finalPrice','quantity','status','lastSyncedAt'] }, listingRows, false, true);
    // Insert price history
    await runBatchedInsert({ table: 'priceHistory', cols: ['id','listingId','oldPrice','newPrice','oldReferencePrice','newReferencePrice','oldExchangeRate','newExchangeRate','reason','percentChange','changedBy','notes','createdAt'] }, priceHistoryRows, false, false);

    return json({ success: true, source: 'tcgcsv', tcg, totalCards: allCards.length, createdCards, updatedCards, createdListings });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;
