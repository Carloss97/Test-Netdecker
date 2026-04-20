import { pickDb, ensureSchema } from '../../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const body = await request.json().catch(() => ({}));
    if (!body.confirm) return new Response(JSON.stringify({ success: false, error: 'Missing confirm flag' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    // Preserve exchangeRateCache and pricingConfig; clear set-specific caches and catalog tables
    try {
      // remove setPrices caches
      await db.prepare("DELETE FROM appConfig WHERE key LIKE 'setPrices:%'").run();

      // delete price history, listings, cards, editions, priceSyncRun
      await db.prepare('DELETE FROM priceHistory').run();
      await db.prepare('DELETE FROM listing').run();
      await db.prepare('DELETE FROM card').run();
      await db.prepare('DELETE FROM edition').run();
      await db.prepare('DELETE FROM priceSyncRun').run();

      return new Response(JSON.stringify({ success: true, message: 'Catalog reset completed (cards, listings, editions, price history cleared).' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
