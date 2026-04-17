import { pickDb, ensureSchema, firstRow } from '../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const db = pickDb(env);
    if (db) await ensureSchema(db);

    if (request.method === 'GET') {
      if (!db) {
        const defaultRate = Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || 950);
        const defaultConfig = { defaultMarginMultiplier: Number(env.DEFAULT_MARGIN_MULTIPLIER) || 1.2, exchangeRate: { mode: 'manual', activeRate: defaultRate, source: 'env' } };
        return new Response(JSON.stringify({ config: defaultConfig }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      const res = await db.prepare('SELECT value FROM appConfig WHERE key = ?').bind('pricingConfig').all();
      const row = firstRow(res);
      if (row && row.value) {
        try {
          const parsed = JSON.parse(row.value);
          return new Response(JSON.stringify({ config: parsed }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (_) {}
      }

      const defaultRate = Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || 950);
      const defaultConfig = { defaultMarginMultiplier: Number(env.DEFAULT_MARGIN_MULTIPLIER) || 1.2, exchangeRate: { mode: 'manual', activeRate: defaultRate, source: 'env' } };
      return new Response(JSON.stringify({ config: defaultConfig }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const defaultMarginMultiplier = typeof body.defaultMarginMultiplier === 'number' ? body.defaultMarginMultiplier : (Number(body.defaultMarginMultiplier) || Number(env.DEFAULT_MARGIN_MULTIPLIER) || 1.2);
      const exchangeRateMode = body.exchangeRateMode === 'api' ? 'api' : 'manual';
      const manualUsdToClp = typeof body.manualUsdToClp === 'number' ? body.manualUsdToClp : (Number(body.manualUsdToClp) || Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP) || 950);

      const config = {
        defaultMarginMultiplier,
        exchangeRate: {
          mode: exchangeRateMode,
          activeRate: exchangeRateMode === 'manual' ? manualUsdToClp : null,
          source: exchangeRateMode === 'manual' ? 'manual' : 'api',
        },
      };

      if (db) {
        await db.prepare('INSERT OR REPLACE INTO appConfig (key, value, updatedAt) VALUES (?, ?, ?)').bind('pricingConfig', JSON.stringify(config), new Date().toISOString()).run();
      }

      return new Response(JSON.stringify({ success: true, config }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
