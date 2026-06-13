import { pickDb, ensureSchema, firstRow } from '../../_shared/d1.js';
import { incr, startTimer } from '../../_shared/metrics.js';

export async function onRequest(context) {
  const { request, env } = context;
  const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  try {
    const stop = startTimer('exchange_rate_request_duration_seconds');
    if (request.method === 'OPTIONS') {
      stop();
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }
    if (request.method !== 'GET') {
      stop();
      incr('exchange_rate_requests_total', { result: 'method_not_allowed' });
      return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
    }

    const db = pickDb(env);
    if (db) await ensureSchema(db);

    const ttlSeconds = Number(env.EXCHANGE_RATE_CACHE_TTL_SECONDS || env.VITE_EXCHANGE_RATE_CACHE_TTL_SECONDS || 3600);

    // Determine pricing config from DB if available; fall back to env behavior when DB absent
    let pricingMode = null; // null = unknown
    let pricingConfig = null;
    if (db) {
      try {
        const pcRes = await db.prepare('SELECT value FROM appConfig WHERE key = ?').bind('pricingConfig').all();
        const pcRow = firstRow(pcRes);
        if (pcRow && pcRow.value) {
          const parsed = JSON.parse(pcRow.value);
          pricingConfig = parsed;
          pricingMode = parsed?.exchangeRate?.mode || null;
        }
      } catch (_) {
        // ignore
      }
    }

    // If pricingMode is explicitly 'manual' use the manual env/fallback
    if (pricingMode === 'manual') {
      // Prefer manual active rate stored in pricingConfig when available
      let manualRate = null;
      if (pricingConfig && pricingConfig.exchangeRate && Number.isFinite(Number(pricingConfig.exchangeRate.activeRate))) {
        manualRate = Number(pricingConfig.exchangeRate.activeRate);
      }
      if (!manualRate || manualRate <= 0) {
        manualRate = Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || env.FALLBACK_USD_TO_CLP || 0);
      }
      const val = Number.isFinite(manualRate) && manualRate > 0 ? manualRate : Number(env.FALLBACK_USD_TO_CLP || 1000);
      incr('exchange_rate_requests_total', { source: 'manual', result: 'success' });
      stop();
      return jsonResponse({ success: true, usdToCLP: val, source: 'manual', fetchedAt: new Date().toISOString() });
    }

    // If pricingMode is null (no DB) we still allow manual env to force a static rate
    if (!db) {
      const manual = Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || 0);
      if (Number.isFinite(manual) && manual > 0) {
        return jsonResponse({ success: true, usdToCLP: manual, source: 'manual', fetchedAt: new Date().toISOString() });
      }
    }

    // From here: local MVP mode. Use cache when fresh, otherwise manual/static fallback.
    if (db) {
      try {
        const cacheRes = await db.prepare('SELECT value FROM appConfig WHERE key = ?').bind('exchangeRateCache').all();
        const cacheRow = firstRow(cacheRes);
          if (cacheRow && cacheRow.value) {
          const cached = JSON.parse(cacheRow.value);
          const cachedRate = Number(cached?.usdToCLP);
          const fetchedAt = cached?.fetchedAt ? new Date(cached.fetchedAt).getTime() : 0;
          if (!isNaN(cachedRate) && fetchedAt && (Date.now() - fetchedAt) < ttlSeconds * 1000) {
            incr('exchange_rate_requests_total', { source: 'cache', result: 'success' });
            stop();
            return jsonResponse({ success: true, usdToCLP: Number(cachedRate), source: 'cache', fetchedAt: cached.fetchedAt });
          }
        }
      } catch (_) {
        // ignore cache read errors
      }
    }

    const fallback = Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || env.FALLBACK_USD_TO_CLP || 1000);
    const rate = Number.isFinite(fallback) && fallback > 0 ? fallback : 1000;
    const fetchedAt = new Date().toISOString();
    if (db) {
      try {
        await db.prepare('INSERT OR REPLACE INTO appConfig (key, value, updatedAt) VALUES (?, ?, ?)')
          .bind('exchangeRateCache', JSON.stringify({ usdToCLP: rate, source: 'manual-local', fetchedAt }), fetchedAt)
          .run();
      } catch (_) {
        // ignore cache write errors
      }
    }
    incr('exchange_rate_requests_total', { source: 'manual-local', result: 'success' });
    stop();
    return jsonResponse({ success: true, usdToCLP: rate, source: 'manual-local', fetchedAt });
  } catch (err) {
    // Try to persist last error for debugging when DB is available
    try {
      const dbErr = pickDb(env);
      if (dbErr) {
        const payload = JSON.stringify({ error: String(err), url: request?.url || null, ts: new Date().toISOString() });
        await dbErr.prepare('INSERT OR REPLACE INTO appConfig (key, value, updatedAt) VALUES (?, ?, ?)')
          .bind('exchangeRateLastError', payload, new Date().toISOString())
          .run();
      }
    } catch (_) {
      // ignore logging failures
    }
    incr('exchange_rate_requests_total', { result: 'error' });
    stop();
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;
