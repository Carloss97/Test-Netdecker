import { getGroups, getGroupProducts, getGroupPrices, resolveGroupBySetCode, getSetCards } from '../../../_shared/tcgcsv.js';
import { pickDb, ensureSchema, firstRow, buildSelectColumns, aliasSelectColumn } from '../../../_shared/d1.js';
import { refreshExchangeRate } from '../../../_shared/exchange-rate.js';

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

    // Resolve group first to expose edition metadata (tcg-aware resolution)
    let groups;
    try {
      groups = await getGroups(tcg);
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: 'TCGCSV getGroups failed', detail: String(e) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    const resolved = resolveGroupBySetCode(tcg, groups, setCode);

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

    // Prefer cached set cards (persisted in appConfig) to avoid repeated external calls
    const cacheKey = `setCards:${tcg}:${editionCode}`;
    const ttl = Number(env.EXTERNAL_SET_CACHE_TTL_SECONDS || env.VITE_EXTERNAL_SET_CACHE_TTL_SECONDS || 3600);
    let cards = [];
    if (db) {
      try {
        const cacheRes = await db.prepare('SELECT value FROM appConfig WHERE key = ?').bind(cacheKey).all();
        const cacheRow = (Array.isArray(cacheRes?.results) ? cacheRes.results[0] : (Array.isArray(cacheRes) ? cacheRes[0] : null));
        if (cacheRow && cacheRow.value) {
          const parsed = JSON.parse(cacheRow.value);
          if (parsed && parsed.fetchedAt && (Date.now() - new Date(parsed.fetchedAt).getTime()) < (ttl * 1000) && Array.isArray(parsed.cards)) {
            cards = parsed.cards;
          }
        }
      } catch (_) {}
    }

    if (!cards || cards.length === 0) {
      try {
        cards = await getSetCards(tcg, setCode);
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: 'TCGCSV fetch failed', detail: String(e) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
      }
      if (db) {
        try {
          await db.prepare('INSERT OR REPLACE INTO appConfig (key, value) VALUES (?, ?)').bind(cacheKey, JSON.stringify({ fetchedAt: new Date().toISOString(), cards })).run();
        } catch (_) {}
      }
    }

    if (Array.isArray(cards) && cards.length === 0) {
      try { console.warn(`[import/set] resolved group for ${tcg}:${setCode} (abbr=${resolved.abbreviation}, id=${resolved.groupId}) but fetched 0 cards`); } catch (_) {}
    }

    // Prefer cached exchange rate from appConfig when available (so imports use same rate as admin)
    let usdToClp = Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || 950);
    if (db) {
      try {
        const pc = await db.prepare('SELECT value FROM appConfig WHERE key = ?').bind('exchangeRateCache').all();
        const first = Array.isArray(pc?.results) ? pc.results[0] : (Array.isArray(pc) ? pc[0] : null);
        if (first && first.value) {
          const parsed = JSON.parse(first.value);
          const cached = Number(parsed?.usdToCLP);
          if (!isNaN(cached) && cached > 0) usdToClp = cached;
        } else {
          // Try a quick live refresh if no cache found (bounded timeout)
          try {
            const p = refreshExchangeRate(env, db);
            const r = await Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('refresh_timeout')), 3000))]);
            if (r && Number.isFinite(Number(r.usdToCLP)) && Number(r.usdToCLP) > 0) usdToClp = Number(r.usdToCLP);
          } catch (_) {
            // ignore
          }
        }
      } catch (_) {}
    }

    const results = [];
    let createdCards = 0;
    let updatedCards = 0;
    let createdListings = 0;

    if (db && cards.length > 0) {
      // Preload existing cards and listings to avoid per-card SELECTs
      const cardIds = cards.map((c) => `${tcg}:${c.externalId}`);
      const chunk = (arr, size) => { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };
      const SQLITE_MAX_VARS = 900; // conservative limit for D1/SQLite
      const safeSelectChunk = Math.max(1, Math.min(800, Math.floor(SQLITE_MAX_VARS / 1)));

      const rowsFrom = (res) => {
        if (!res) return [];
        if (Array.isArray(res.results)) return res.results;
        if (Array.isArray(res)) return res;
        return [];
      };

      // Query existing cards in chunks
      const existingCardIds = new Set();
      const cardIdCols = await buildSelectColumns(db, 'card', 'c', ['id']);
      for (const cids of chunk(cardIds, safeSelectChunk)) {
        const placeholders = cids.map(() => '?').join(',');
        const sel = await db.prepare(`SELECT ${cardIdCols} FROM card c WHERE c.id IN (${placeholders})`).bind(...cids).all();
        for (const r of rowsFrom(sel)) existingCardIds.add(r.id || r.ID || r.Id || r.cardId || r.cardid || r.id);
      }

      // Query existing listings for this edition
      const existingListingCardIds = new Set();
      const listingCols = await buildSelectColumns(db, 'listing', 'l', ['id','cardId']);
      const listingColsAliasedId = aliasSelectColumn(listingCols, 'l', 'id', 'listingId');
      for (const cids of chunk(cardIds, safeSelectChunk)) {
        const placeholders = cids.map(() => '?').join(',');
        const sel = await db.prepare(`SELECT ${listingColsAliasedId} FROM listing l WHERE l.editionCode = ? AND l.cardId IN (${placeholders})`).bind(editionCode, ...cids).all();
        for (const r of rowsFrom(sel)) existingListingCardIds.add(r.cardId || r.cardid || r.cardID || r.cardId);
      }

      // Build rows to insert in batches to reduce number of D1 calls
      const cardRows = [];
      const listingRows = [];
      const priceHistoryRows = [];

      for (const c of cards) {
        const cardId = `${tcg}:${c.externalId}`;
        const existed = existingCardIds.has(cardId);

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
          createdListings += 1; // count attempted new listings
        }

        results.push({ externalId: c.externalId, cardName: c.cardName, priceMarket: c.priceMarket });
      }

      // Choose a safe chunk size based on SQLite parameter limits
      // reuse SQLITE_MAX_VARS declared above
      const runBatchedInsert = async (tableCols, rows, orReplace = false, orIgnore = false) => {
        if (!rows || rows.length === 0) return;
        const colCount = tableCols.cols.length;
        // compute safe batch size so that colCount * batchSize <= SQLITE_MAX_VARS
        const safeBatch = Math.max(1, Math.floor(SQLITE_MAX_VARS / Math.max(1, colCount)));

        const insertOne = async (row) => {
          const placeholders = `(${new Array(colCount).fill('?').join(',')})`;
          const sql = `INSERT ${orReplace ? 'OR REPLACE' : orIgnore ? 'OR IGNORE' : ''} INTO ${tableCols.table} (${tableCols.cols.join(',')}) VALUES ${placeholders};`;
          try {
            await db.prepare(sql).bind(...row).run();
            return true;
          } catch (e) {
            return false;
          }
        };

        const batches = (arr, size) => { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };

        for (const batch of batches(rows, safeBatch)) {
          const placeholders = batch.map(() => `(${new Array(colCount).fill('?').join(',')})`).join(',');
          const sql = `INSERT ${orReplace ? 'OR REPLACE' : orIgnore ? 'OR IGNORE' : ''} INTO ${tableCols.table} (${tableCols.cols.join(',')}) VALUES ${placeholders};`;
          const params = batch.flat();
          try {
            await db.prepare(sql).bind(...params).run();
          } catch (e) {
            // Batch failed — try per-row to salvage as many inserts as possible
            for (const row of batch) {
              await insertOne(row);
            }
          }
        }
      };

      // Insert cards (INSERT OR REPLACE)
      await runBatchedInsert({ table: 'card', cols: ['id','externalId','tcg','editionCode','cardCode','cardName','rarity','imageUrl','priceMarket'] }, cardRows, true, false);

      // Insert listings (INSERT OR IGNORE)
      await runBatchedInsert({ table: 'listing', cols: ['id','cardId','editionCode','referencePrice','marginMultiplier','finalPrice','quantity','status','lastSyncedAt'] }, listingRows, false, true);

      // Insert price history rows
      await runBatchedInsert({ table: 'priceHistory', cols: ['id','listingId','oldPrice','newPrice','oldReferencePrice','newReferencePrice','oldExchangeRate','newExchangeRate','reason','percentChange','changedBy','notes','createdAt'] }, priceHistoryRows, false, false);
    } else {
      // No DB configured — just return inspection results
      for (const p of cards) results.push({ externalId: p.externalId, cardName: p.cardName, priceMarket: p.priceMarket });
    }

    return new Response(JSON.stringify({ success: true, total: cards.length, createdCards, updatedCards, createdListings, results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
