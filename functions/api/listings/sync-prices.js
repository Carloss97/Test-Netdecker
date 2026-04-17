import { pickDb, ensureSchema } from '../../_shared/d1.js';
import { getSetCards } from '../../_shared/tcgcsv.js';
import { getUSDtoCLPRateMetaFast } from '../../_shared/exchange-rate.js';

function estimateFallbackReferencePrice(tcgName, rarity) {
  const baseByTcg = { MAGIC: 0.5, POKEMON: 0.75, YUGIOH: 0.5, ONE_PIECE: 0.35, DIGIMON: 0.35, WEISS_SCHWARZ: 0.35 };
  const base = baseByTcg[tcgName] ?? 0.5;
  const r = (rarity || '').toLowerCase();
  let multiplier = 0.75;
  if (r.includes('mythic') || r.includes('secret') || r.includes('ultimate') || r.includes('legendary')) multiplier = 3;
  else if (r.includes('ultra') || r.includes('gold') || r.includes('rainbow') || r.includes('alt')) multiplier = 2;
  else if (r.includes('super') || r.includes('hyper') || r === 'sr' || r === 'ur') multiplier = 1.5;
  else if (r.includes('rare') || r.includes('holo') || r.includes('parallel')) multiplier = 1.2;
  else if (r.includes('uncommon')) multiplier = 1;
  return Number((base * multiplier).toFixed(2));
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const body = (request.method === 'GET')
      ? Object.fromEntries(new URL(request.url).searchParams.entries())
      : await request.json().catch(() => ({}));

    const db = pickDb(env);
    if (db) await ensureSchema(db);

    // create a run record for this sync
    let runId = null;
    const startedAt = new Date().toISOString();
    if (db) {
      runId = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `run-${Date.now()}`;
      await db.prepare(`INSERT INTO priceSyncRun (id, source, status, notes, total, updated, volatile, failed, roundingMultiple, startedAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(runId, body.source || 'manual', 'running', body.notes || null, 0, 0, 0, 0, Number(body.roundingMultiple) || 1, startedAt, startedAt)
        .run();
    }

    let usdToClp = Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || env.FALLBACK_USD_TO_CLP || 950);
    if (db) {
      try {
        const meta = await getUSDtoCLPRateMetaFast(env, db);
        if (meta && Number.isFinite(Number(meta.usdToCLP)) && Number(meta.usdToCLP) > 0) usdToClp = Number(meta.usdToCLP);
      } catch (_) {
        // fall back to env if cache read fails
      }
    }

    const updates = body.updates;
    const inventoryOnly = body.inventoryOnly === 'true' || body.inventoryOnly === true;
    const tcgNameFilter = body.tcgName || body.tcg || null;
    let editionFilter = body.editionId || null;
    if (editionFilter && typeof editionFilter === 'string' && editionFilter.includes(':')) {
      // if editionId like TCG:CODE, extract code
      const parts = editionFilter.split(':');
      editionFilter = parts.slice(1).join(':');
    }

    const result = { total: 0, updated: 0, failed: 0, errors: [] };

    if (Array.isArray(updates) && updates.length > 0) {
      result.total = updates.length;
      for (const u of updates) {
        try {
          if (!db) throw new Error('No DB binding available');
          if (u.listingId) {
            const lres = await db.prepare('SELECT id, referencePrice, marginMultiplier, finalPrice FROM listing WHERE id = ?').bind(u.listingId).all();
            const listing = (Array.isArray(lres.results) ? lres.results[0] : (Array.isArray(lres) ? lres[0] : null));
            if (!listing) throw new Error('Listing not found');
            const margin = typeof u.marginMultiplier === 'number' ? u.marginMultiplier : (listing.marginMultiplier || 1);
            const ref = Number(u.referencePrice);
            if (!Number.isFinite(ref) || ref <= 0) throw new Error('referencePrice must be a positive number');
            const finalPrice = Math.round(ref * margin * usdToClp);
            await db.prepare('UPDATE listing SET referencePrice = ?, marginMultiplier = ?, finalPrice = ?, lastSyncedAt = ? WHERE id = ?')
              .bind(ref, margin, finalPrice, new Date().toISOString(), u.listingId).run();
            // record price history for manual update
            try {
              const phId = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `ph-${Date.now()}-${Math.floor(Math.random()*10000)}`;
              const percent = listing.finalPrice && listing.finalPrice > 0 ? ((finalPrice - listing.finalPrice) / listing.finalPrice) * 100 : null;
              await db.prepare('INSERT INTO priceHistory (id, listingId, oldPrice, newPrice, oldReferencePrice, newReferencePrice, reason, percentChange, changedBy, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                .bind(phId, listing.id || u.listingId, listing.finalPrice ?? null, finalPrice, listing.referencePrice ?? null, ref, 'MANUAL_SYNC', percent, body.changedBy || body.source || 'system', body.notes || null, new Date().toISOString())
                .run();
            } catch (_) {}
            result.updated += 1;
            continue;
          }

          if (u.cardId) {
            // create a listing for cardId
            const cardId = u.cardId;
            const listingId = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `L-${Date.now()}-${Math.floor(Math.random()*10000)}`;
            const ref = Number(u.referencePrice) || 0;
            const margin = typeof u.marginMultiplier === 'number' ? u.marginMultiplier : 1.2;
            const finalPrice = Math.round(ref * margin * usdToClp);
            await db.prepare('INSERT INTO listing (id, cardId, editionCode, referencePrice, marginMultiplier, finalPrice, quantity, status, lastSyncedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
              .bind(listingId, cardId, u.editionCode || '', ref, margin, finalPrice, u.quantity ? Number(u.quantity) : 0, 'active', new Date().toISOString()).run();
            try {
              const phId = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `ph-${Date.now()}-${Math.floor(Math.random()*10000)}`;
              await db.prepare('INSERT INTO priceHistory (id, listingId, oldPrice, newPrice, oldReferencePrice, newReferencePrice, reason, percentChange, changedBy, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                .bind(phId, listingId, null, finalPrice, null, ref, 'TCGPLAYER_SYNC', null, body.changedBy || body.source || 'system', 'Initial listing creation', new Date().toISOString())
                .run();
            } catch (_) {}
            result.updated += 1;
            continue;
          }

          throw new Error('Update must include listingId or cardId');
        } catch (err) {
          result.failed += 1;
          result.errors.push({ id: u.listingId || u.cardId || 'N/A', message: (err && err.message) || String(err) });
        }
      }

      return new Response(JSON.stringify({ success: true, ...result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // No explicit updates -> fetch listings and try to fetch external prices
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available for sync' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    // Build query
    let sql = `SELECT l.id as listingId, l.cardId as cardId, l.referencePrice, l.marginMultiplier, l.finalPrice, l.quantity, l.status, c.externalId as externalId, c.cardName as cardName, c.tcg as tcg, c.editionCode as editionCode, c.rarity as rarity
      FROM listing l JOIN card c ON l.cardId = c.id WHERE l.status = 'active'`;
    const binds = [];
    if (inventoryOnly) {
      sql += ' AND l.quantity > 0';
    }
    if (tcgNameFilter) {
      sql += ' AND c.tcg = ?'; binds.push(tcgNameFilter);
    }
    if (editionFilter) {
      sql += ' AND c.editionCode = ?'; binds.push(String(editionFilter).toUpperCase());
    }

    const rowsRes = await db.prepare(sql).bind(...binds).all();
    const rows = Array.isArray(rowsRes.results) ? rowsRes.results : (Array.isArray(rowsRes) ? rowsRes : []);
    result.total = rows.length;

    // Group by tcg|editionCode
    const grouped = new Map();
    for (const r of rows) {
      // derive tcg from card row when missing by using cardId prefix (fallback)
      const inferredTcg = r.tcg || (r.cardId && String(r.cardId).split(':')[0]) || 'LOCAL';
      const key = `${inferredTcg}|${String(r.editionCode || '').toUpperCase()}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(r);
    }

    for (const [key, group] of grouped.entries()) {
      const [tcgName, editionCode] = key.split('|');

      // Try to use cached set prices to avoid external calls on every sync
      const cacheKey = `setPrices:${tcgName}:${editionCode}`;
      const ttl = Number(env.EXTERNAL_SET_CACHE_TTL_SECONDS || env.VITE_EXTERNAL_SET_CACHE_TTL_SECONDS || 3600);
      let setPriceLookup = new Map();
      let setPriceByName = new Map();
      let usedCache = false;

      if (db) {
        try {
          const cacheRes = await db.prepare('SELECT value FROM appConfig WHERE key = ?').bind(cacheKey).all();
          const cacheRow = (Array.isArray(cacheRes?.results) ? cacheRes.results[0] : (Array.isArray(cacheRes) ? cacheRes[0] : null));
          if (cacheRow && cacheRow.value) {
            const parsed = JSON.parse(cacheRow.value);
            const fetchedAt = parsed?.fetchedAt ? new Date(parsed.fetchedAt).getTime() : 0;
            if (fetchedAt && (Date.now() - fetchedAt) < ttl * 1000) {
              // restore maps
              for (const [k, v] of Object.entries(parsed.pricesById || {})) setPriceLookup.set(k, v);
              for (const [k, v] of Object.entries(parsed.pricesByName || {})) setPriceByName.set(k, v);
              usedCache = true;
            }
          }
        } catch (_) {
          // ignore cache read errors
        }
      }

      if (!usedCache) {
        // Respect rate limits - gentle pause
        await new Promise((res) => setTimeout(res, 120));
        const _t0 = Date.now();
        const setCards = await getSetCards(tcgName, editionCode).catch(() => []);
        const _t1 = Date.now() - _t0;
        try { console.log(`[sync-prices] fetched set ${tcgName}/${editionCode} in ${_t1}ms; cards=${setCards.length}`); } catch (_) {}
        for (const s of setCards) {
          const price = s.priceMarket ?? s.priceMid ?? s.priceLow;
          if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
            setPriceLookup.set(s.externalId, price);
            const nameKey = (s.cardName || '').trim().toLowerCase();
            const existing = setPriceByName.get(nameKey);
            if (!existing || price > existing) setPriceByName.set(nameKey, price);
          }
        }

        // persist cache for subsequent syncs
        if (db) {
          try {
            await db.prepare('INSERT OR REPLACE INTO appConfig (key, value, updatedAt) VALUES (?, ?, ?)')
              .bind(cacheKey, JSON.stringify({ pricesById: Object.fromEntries([...setPriceLookup.entries()]), pricesByName: Object.fromEntries([...setPriceByName.entries()]), fetchedAt: new Date().toISOString() }), new Date().toISOString())
              .run();
          } catch (_) {
            // ignore cache write errors
          }
        }
      }

      for (const listing of group) {
        try {
          const externalPrice = setPriceLookup.get(String(listing.externalId)) ?? setPriceByName.get(String((listing.cardName || '').trim().toLowerCase())) ?? null;
          const safeStoredRef = listing.referencePrice > 0 ? listing.referencePrice : null;
          const fallbackRef = estimateFallbackReferencePrice(tcgName, listing.rarity || undefined);
          let chosenReference = fallbackRef;
          if (externalPrice && externalPrice > 0) chosenReference = externalPrice;
          else if (safeStoredRef) chosenReference = safeStoredRef;

          const margin = listing.marginMultiplier || 1.2;
          const finalPrice = Math.round(chosenReference * margin * usdToClp);
          // capture old values and update, then write history
          try {
            const oldFinal = listing.finalPrice ?? null;
            const oldRef = listing.referencePrice ?? null;
            await db.prepare('UPDATE listing SET referencePrice = ?, marginMultiplier = ?, finalPrice = ?, lastSyncedAt = ? WHERE id = ?')
              .bind(chosenReference, margin, finalPrice, new Date().toISOString(), listing.listingId).run();
            const phId = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `ph-${Date.now()}-${Math.floor(Math.random()*10000)}`;
            const percent = oldFinal && oldFinal > 0 ? ((finalPrice - oldFinal) / oldFinal) * 100 : null;
            await db.prepare('INSERT INTO priceHistory (id, listingId, oldPrice, newPrice, oldReferencePrice, newReferencePrice, reason, percentChange, changedBy, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
              .bind(phId, listing.listingId, oldFinal, finalPrice, oldRef, chosenReference, 'EXTERNAL_API_SYNC', percent, body.changedBy || body.source || 'system', null, new Date().toISOString())
              .run();
            result.updated += 1;
          } catch (err) {
            result.failed += 1;
            result.errors.push({ listingId: listing.listingId, message: (err && err.message) || String(err) });
          }
        } catch (err) {
          result.failed += 1;
          result.errors.push({ listingId: listing.listingId, message: (err && err.message) || String(err) });
        }
      }
    }

    // finalize run
    if (db && runId) {
      const completedAt = new Date().toISOString();
      try {
        await db.prepare('UPDATE priceSyncRun SET status = ?, total = ?, updated = ?, failed = ?, errors = ?, completedAt = ? WHERE id = ?')
          .bind(result.failed > 0 && result.updated === 0 ? 'failed' : 'completed', result.total, result.updated, result.failed, (result.errors && result.errors.length ? JSON.stringify(result.errors) : null), completedAt, runId)
          .run();
      } catch (_) {}
    }

    return new Response(JSON.stringify({ success: true, runId, ...result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    // mark run failed when possible
    if (typeof err !== 'undefined' && env) {
      const dbFail = pickDb(env);
      if (dbFail) {
        try {
          await dbFail.prepare('UPDATE priceSyncRun SET status = ?, errors = ?, completedAt = ? WHERE id = ?')
            .bind('failed', JSON.stringify([{ listingId: 'N/A', message: String(err) }]), new Date().toISOString(), runId || 'unknown').run();
        } catch (_) {}
      }
    }
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
