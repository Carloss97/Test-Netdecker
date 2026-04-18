import { pickDb, ensureSchema, firstRow } from '../../_shared/d1.js';
import { getUSDtoCLPRateMeta } from '../../_shared/price.js';
import { validateToken } from '../../_shared/adminAuth.js';

function extractToken(request) {
  const auth = request.headers.get('authorization') || '';
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return request.headers.get('x-admin-token') || '';
}

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {

    const db = pickDb(env);
    if (db) await ensureSchema(db);

    if (request.method === 'GET') {
      const defaultRate = Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || 1000);
      const defaultConfig = { defaultMarginMultiplier: Number(env.DEFAULT_MARGIN_MULTIPLIER) || 1.0, exchangeRate: { mode: 'manual', activeRate: defaultRate, source: 'env' } };

      if (!db) {
        return new Response(JSON.stringify({ config: defaultConfig }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      const res = await db.prepare('SELECT value FROM appConfig WHERE key = ?').bind('pricingConfig').all();
      const row = firstRow(res);
      if (row && row.value) {
        try {
          const parsed = JSON.parse(row.value);
          // Ensure exchangeRate.activeRate is always a number for UI
          if (!parsed.exchangeRate) parsed.exchangeRate = { mode: 'manual', activeRate: defaultRate, source: 'env' };
          if (parsed.exchangeRate.activeRate === null || parsed.exchangeRate.activeRate === undefined) parsed.exchangeRate.activeRate = defaultRate;

          // If using API mode, prefer cached exchangeRate value when present
          try {
            const cacheRes = await db.prepare('SELECT value FROM appConfig WHERE key = ?').bind('exchangeRateCache').all();
            const cacheRow = firstRow(cacheRes);
            if (cacheRow && cacheRow.value) {
              const cached = JSON.parse(cacheRow.value);
              const cachedRate = Number(cached?.usdToCLP);
              if (!isNaN(cachedRate) && parsed.exchangeRate && parsed.exchangeRate.mode === 'api') {
                parsed.exchangeRate.activeRate = cachedRate;
                parsed.exchangeRate.source = cached.source || parsed.exchangeRate.source || 'cache';
                parsed.exchangeRate.fetchedAt = cached.fetchedAt || null;
              }
            }
          } catch (_) {}

          return new Response(JSON.stringify({ config: parsed }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (_) {}
      }

      return new Response(JSON.stringify({ config: defaultConfig }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const defaultMarginMultiplier = typeof body.defaultMarginMultiplier === 'number' ? body.defaultMarginMultiplier : (Number(body.defaultMarginMultiplier) || Number(env.DEFAULT_MARGIN_MULTIPLIER) || 1.0);
      const exchangeRateMode = body.exchangeRateMode === 'api' ? 'api' : 'manual';
      const manualUsdToClp = typeof body.manualUsdToClp === 'number' ? body.manualUsdToClp : (Number(body.manualUsdToClp) || Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP) || 1000);

      const defaultRate = Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || 1000);
      const config = {
        defaultMarginMultiplier,
        exchangeRate: {
          mode: exchangeRateMode,
          // always provide a numeric activeRate for the UI; when using 'api' mode, keep env/default as placeholder
          activeRate: exchangeRateMode === 'manual' ? manualUsdToClp : defaultRate,
          source: exchangeRateMode === 'manual' ? 'manual' : 'api',
        },
      };

      if (db) {
        // If switching to API mode but a manual value was provided, persist it as a temporary cache
        // so the UI shows the provided value until the live API overwrites it.
        if (exchangeRateMode === 'api' && Number.isFinite(Number(manualUsdToClp)) && Number(manualUsdToClp) > 0) {
          try {
            await db.prepare('INSERT OR REPLACE INTO appConfig (key, value, updatedAt) VALUES (?, ?, ?)')
              .bind('exchangeRateCache', JSON.stringify({ usdToCLP: Number(manualUsdToClp), source: 'manual-placeholder', fetchedAt: new Date().toISOString() }), new Date().toISOString()).run();
          } catch (_) {}
        }
        await db.prepare('INSERT OR REPLACE INTO appConfig (key, value, updatedAt) VALUES (?, ?, ?)').bind('pricingConfig', JSON.stringify(config), new Date().toISOString()).run();
      }

      return new Response(JSON.stringify({ success: true, config }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
