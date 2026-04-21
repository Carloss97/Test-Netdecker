import { pickDb, ensureSchema, buildSelectColumns, aliasSelectColumn } from '../../_shared/d1.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const db = pickDb(env);
    if (db) await ensureSchema(db);

    if (request.method === 'GET') {
      const url = new URL(request.url);
      const gtin = String(url.searchParams.get('gtin') || '').trim();
      if (!gtin) return json({ success: false, error: 'gtin required' }, 400);

      if (!db) return json({ success: false, error: 'No DB binding available' }, 500);

      const listingCols = await buildSelectColumns(db, 'listing', 'l', ['id','cardId','editionCode','referencePrice','finalPrice','quantity','status','gtin','sku','currency']);
      let listingSelect = listingCols;
      listingSelect = aliasSelectColumn(listingSelect, 'l', 'id', 'listingId');
      const res = await db.prepare(`SELECT ${listingSelect} FROM listing l WHERE l.gtin = ? LIMIT 1`).bind(gtin).all();
      const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
      const row = rows[0] || null;
      if (!row) return json({ success: false, error: 'not_found' }, 404);
      return json({ success: true, listing: row });
    }

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const gtin = String(body.gtin || '').trim();
      if (!gtin) return json({ success: false, error: 'gtin required' }, 400);
      if (!db) return json({ success: false, error: 'No DB binding available' }, 500);

      // return existing if present
      try {
        const existRes = await db.prepare('SELECT id FROM listing WHERE gtin = ? LIMIT 1').bind(gtin).all();
        const existRow = Array.isArray(existRes?.results) ? existRes.results[0] : (Array.isArray(existRes) ? existRes[0] : null);
        if (existRow && (existRow.id || existRow.ID)) {
          const lres = await db.prepare('SELECT id, cardId, editionCode, referencePrice, finalPrice, quantity, status, gtin, sku, currency FROM listing WHERE id = ?').bind(existRow.id || existRow.ID).all();
          const lrow = Array.isArray(lres?.results) ? lres.results[0] : (Array.isArray(lres) ? lres[0] : null);
          return json({ success: true, listing: lrow });
        }
      } catch (_) {}

      const listingId = (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : `L-${Date.now()}`;
      const ref = Number.isFinite(Number(body.referencePrice)) ? Number(body.referencePrice) : 0;
      const margin = Number.isFinite(Number(body.marginMultiplier)) ? Number(body.marginMultiplier) : 1.0;
      const usdToClp = Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || env.FALLBACK_USD_TO_CLP || 1000);
      const finalPrice = Number.isFinite(Number(body.finalPrice)) ? Number(body.finalPrice) : Math.round(ref * margin * usdToClp);
      const now = new Date().toISOString();

      await db.prepare('INSERT INTO listing (id, cardId, editionCode, referencePrice, marginMultiplier, finalPrice, quantity, status, gtin, sku, createdAt, updatedAt, currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(listingId, body.cardId || null, body.editionCode || '', ref, margin, finalPrice, Number(body.quantity) || 0, body.status || 'active', gtin, body.sku || null, now, now, body.currency || 'CLP')
        .run();

      const rr = await db.prepare('SELECT id, cardId, editionCode, referencePrice, finalPrice, quantity, status, gtin, sku, currency FROM listing WHERE id = ?').bind(listingId).all();
      const created = Array.isArray(rr?.results) ? rr.results[0] : (Array.isArray(rr) ? rr[0] : null);
      return json({ success: true, listing: created }, 201);
    }

    return json({ success: false, error: 'method_not_allowed' }, 405);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;
