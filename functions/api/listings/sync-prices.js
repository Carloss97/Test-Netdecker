import { pickDb, ensureSchema } from '../../_shared/d1.js';
import { getSetCards } from '../../_shared/tcgcsv.js';

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

    const usdToClp = Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || 950);

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
            const lres = await db.prepare('SELECT id, referencePrice, marginMultiplier FROM listing WHERE id = ?').bind(u.listingId).all();
            const listing = (Array.isArray(lres.results) ? lres.results[0] : (Array.isArray(lres) ? lres[0] : null));
            if (!listing) throw new Error('Listing not found');
            const margin = typeof u.marginMultiplier === 'number' ? u.marginMultiplier : (listing.marginMultiplier || 1);
            const ref = Number(u.referencePrice);
            if (!Number.isFinite(ref) || ref <= 0) throw new Error('referencePrice must be a positive number');
            const finalPrice = Math.round(ref * margin * usdToClp);
            await db.prepare('UPDATE listing SET referencePrice = ?, marginMultiplier = ?, finalPrice = ?, lastSyncedAt = ? WHERE id = ?')
              .bind(ref, margin, finalPrice, new Date().toISOString(), u.listingId).run();
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
    let sql = `SELECT l.id as listingId, l.referencePrice, l.marginMultiplier, l.quantity, l.status, c.externalId as externalId, c.cardName as cardName, c.tcg as tcg, c.editionCode as editionCode, c.rarity as rarity
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
      const key = `${r.tcg}|${String(r.editionCode || '').toUpperCase()}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(r);
    }

    for (const [key, group] of grouped.entries()) {
      const [tcgName, editionCode] = key.split('|');
      // Respect rate limits - gentle pause
      await new Promise((res) => setTimeout(res, 120));
      const setCards = await getSetCards(tcgName, editionCode).catch(() => []);
      const setPriceLookup = new Map();
      const setPriceByName = new Map();
      for (const s of setCards) {
        const price = s.priceMarket ?? s.priceMid ?? s.priceLow;
        if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
          setPriceLookup.set(s.externalId, price);
          const nameKey = (s.cardName || '').trim().toLowerCase();
          const existing = setPriceByName.get(nameKey);
          if (!existing || price > existing) setPriceByName.set(nameKey, price);
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
          await db.prepare('UPDATE listing SET referencePrice = ?, marginMultiplier = ?, finalPrice = ?, lastSyncedAt = ? WHERE id = ?')
            .bind(chosenReference, margin, finalPrice, new Date().toISOString(), listing.listingId).run();
          result.updated += 1;
        } catch (err) {
          result.failed += 1;
          result.errors.push({ listingId: listing.listingId, message: (err && err.message) || String(err) });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, ...result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
