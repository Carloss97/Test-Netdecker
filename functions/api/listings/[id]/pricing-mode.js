import { pickDb, ensureSchema } from '../../../_shared/d1.js';
import { calculateFinalPrice } from '../../../_shared/price.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const { id } = params || {};
    if (!id) return json({ success: false, error: 'id missing' }, 400);
    const body = await request.json().catch(() => ({}));
    const mode = body.mode;

    if (mode !== 'manual' && mode !== 'api') return json({ success: false, error: 'mode must be manual or api' }, 400);

    const db = pickDb(env);
    if (!db) return json({ success: false, error: 'No DB binding' }, 500);
    await ensureSchema(db);

    const curRes = await db.prepare('SELECT * FROM listing WHERE id = ?').bind(id).all();
    const curRow = Array.isArray(curRes?.results) ? curRes.results[0] : (Array.isArray(curRes) ? curRes[0] : null);
    if (!curRow) return json({ success: false, error: 'Listing not found' }, 404);

    if (mode === 'manual') {
      const manualPrice = Number(body.manualPrice);
      if (!Number.isFinite(manualPrice) || manualPrice <= 0) return json({ success: false, error: 'manualPrice must be positive' }, 400);
      const now = new Date().toISOString();
      await db.prepare('UPDATE listing SET finalPrice = ?, status = ?, lastSyncedAt = ?, updatedAt = ? WHERE id = ?')
        .bind(manualPrice, 'manual', now, now, id).run();
      return json({ success: true, listingId: id, finalPrice: manualPrice, pricingMode: 'manual' });
    }

    // API mode: recalculate using referencePrice and marginMultiplier
    const ref = Number(curRow.referencePrice || 0);
    const margin = Number(curRow.marginMultiplier || 1.2);
    const calc = await calculateFinalPrice(env, { referencePrice: ref, marginMultiplier: margin });
    const now = new Date().toISOString();
    await db.prepare('UPDATE listing SET finalPrice = ?, exchangeRate = ?, status = ?, lastSyncedAt = ?, updatedAt = ? WHERE id = ?')
      .bind(calc.finalPrice, calc.exchangeRate, 'active', now, now, id).run();
    return json({ success: true, listingId: id, finalPrice: calc.finalPrice, pricingMode: 'api' });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}
import { pickDb, ensureSchema, buildSelectColumns, aliasSelectColumn } from '../../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const { id } = params || {};
    if (!id) return new Response(JSON.stringify({ success: false, error: 'id missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const body = await request.json().catch(() => ({}));
    // Accept two shapes:
    // - { referencePrice, marginMultiplier } (legacy)
    // - { mode: 'manual'|'api', manualPrice?: number }
    const ref = typeof body.referencePrice === 'number' ? Number(body.referencePrice) : null;
    const margin = typeof body.marginMultiplier === 'number' ? Number(body.marginMultiplier) : null;
    const mode = body.mode || null;
    const manualPrice = typeof body.manualPrice === 'number' ? Number(body.manualPrice) : null;
    const changedBy = body.changedBy || body.source || 'system';

    if (ref === null && margin === null && !mode) return new Response(JSON.stringify({ success: false, error: 'nothing to update' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const usdToClp = Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || 950);

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    const listingCols = await buildSelectColumns(db, 'listing', 'l', ['id','referencePrice','marginMultiplier','finalPrice']);
    let listingSelect = listingCols;
    listingSelect = aliasSelectColumn(listingSelect, 'l', 'id', 'listingId');
    const lres = await db.prepare(`SELECT ${listingSelect} FROM listing l WHERE l.id = ?`).bind(id).all();
    const listing = (Array.isArray(lres.results) ? lres.results[0] : (Array.isArray(lres) ? lres[0] : null));
    if (!listing) return new Response(JSON.stringify({ success: false, error: 'Listing not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    let newRef = ref !== null ? ref : listing.referencePrice || null;
    let newMargin = margin !== null ? margin : listing.marginMultiplier || 1.2;

    if (mode === 'manual') {
      if (manualPrice === null) return new Response(JSON.stringify({ success: false, error: 'manualPrice required for manual mode' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      newRef = manualPrice;
    } else if (mode === 'api') {
      // Clear manual reference so sync will prefer external prices
      newRef = null;
    }

    const refForCalc = newRef !== null ? newRef : 0;
    const newFinal = Math.round(refForCalc * newMargin * usdToClp);

    await db.prepare('UPDATE listing SET referencePrice = ?, marginMultiplier = ?, finalPrice = ?, lastSyncedAt = ? WHERE id = ?')
      .bind(newRef, newMargin, newFinal, new Date().toISOString(), id).run();

    // record price history
    try {
      const phId = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `ph-${Date.now()}-${Math.floor(Math.random()*10000)}`;
      const percent = listing.finalPrice && listing.finalPrice > 0 ? ((newFinal - listing.finalPrice) / listing.finalPrice) * 100 : null;
      await db.prepare('INSERT INTO priceHistory (id, listingId, oldPrice, newPrice, oldReferencePrice, newReferencePrice, reason, percentChange, changedBy, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(phId, id, listing.finalPrice ?? null, newFinal, listing.referencePrice ?? null, newRef, 'MANUAL_PRICING', percent, changedBy, body.notes || null, new Date().toISOString())
        .run();
    } catch (_) {}

    const res = await db.prepare(`SELECT ${listingSelect} FROM listing l WHERE l.id = ?`).bind(id).all();
    const updated = Array.isArray(res.results) ? res.results[0] : (Array.isArray(res) ? res[0] : null);
    return new Response(JSON.stringify({ success: true, listing: updated }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
