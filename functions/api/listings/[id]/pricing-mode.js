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

    const usdToClp = Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || 1000);

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
    let newMargin = margin !== null ? margin : listing.marginMultiplier || 1.0;

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

export default onRequest;

