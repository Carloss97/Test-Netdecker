import { pickDb, ensureSchema } from '../../_shared/d1.js';
import { refreshExchangeRate } from '../../_shared/exchange-rate.js';
import { incr, startTimer } from '../../_shared/metrics.js';

export async function onRequest(context) {
  const { request, env } = context;
  const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  try {
    const stop = startTimer('exchange_rate_refresh_duration_seconds');
    if (request.method === 'OPTIONS') {
      stop();
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }
    if (request.method !== 'POST' && request.method !== 'GET') {
      return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
    }

    const db = pickDb(env);
    if (db) await ensureSchema(db);

    try {
      const result = await refreshExchangeRate(env, db);
      incr('exchange_rate_refresh_total', { result: 'success' });
      stop();
      return jsonResponse({ success: true, ...result });
    } catch (err) {
      incr('exchange_rate_refresh_total', { result: 'failure' });
      stop();
      // try returning stale cache if available
      if (db) {
        try {
          const cacheRes = await db.prepare('SELECT value FROM appConfig WHERE key = ?').bind('exchangeRateCache').all();
          const row = Array.isArray(cacheRes?.results) ? cacheRes.results[0] : (Array.isArray(cacheRes) ? cacheRes[0] : null);
          if (row && row.value) {
            const parsed = JSON.parse(row.value);
            return jsonResponse({ success: true, usdToCLP: Number(parsed.usdToCLP), source: 'cache', note: 'refresh_failed', error: String(err), fetchedAt: parsed.fetchedAt || new Date().toISOString() });
          }
        } catch (_) {}
      }

      return jsonResponse({ success: false, error: String(err) }, 500);
    }
  } catch (err) {
    incr('exchange_rate_refresh_total', { result: 'failure' });
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}
