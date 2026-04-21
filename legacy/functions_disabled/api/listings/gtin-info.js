import { pickDb, ensureSchema } from '../../_shared/d1.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const gtin = String(url.searchParams.get('gtin') || '').trim();
    if (!gtin) return json({ success: false, error: 'gtin required' }, 400);

    const db = pickDb(env);
    if (db) await ensureSchema(db);

    // Try DB first
    if (db) {
      try {
        const res = await db.prepare('SELECT id, gtin, sku, finalPrice, quantity FROM listing WHERE gtin = ? LIMIT 1').bind(gtin).all();
        const row = Array.isArray(res?.results) ? res.results[0] : (Array.isArray(res) ? res[0] : null);
        if (row && (row.id || row.ID)) {
          return json({ success: true, listing: row }, 200);
        }
      } catch (_) {}
    }

    // Fallback: try public product APIs (OpenFoodFacts)
    try {
      const resp = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(gtin)}.json`, { method: 'GET' });
      if (resp && resp.ok) {
        const data = await resp.json();
        if (data && Number(data.status) === 1 && data.product) {
          const p = data.product;
          const product = {
            title: p.product_name || p.product_name_en || p.generic_name || null,
            brand: (p.brands || null),
            image: p.image_url || p.image_front_small_url || null,
            raw: p,
            source: 'openfoodfacts'
          };
          return json({ success: true, product }, 200);
        }
      }
    } catch (err) {
      // ignore external lookup errors
    }

    return json({ success: false, error: 'not_found' }, 404);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;
