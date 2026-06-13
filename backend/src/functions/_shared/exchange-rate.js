import { pickDb, ensureSchema, firstRow } from './d1.js';

async function getUSDtoCLPRateMetaFast(env, db, ttlSeconds) {
  if (!db) return null;
  ttlSeconds = Number(ttlSeconds || env.EXCHANGE_RATE_CACHE_TTL_SECONDS || env.VITE_EXCHANGE_RATE_CACHE_TTL_SECONDS || 3600);
  try {
    await ensureSchema(db);
  } catch (_) {}

  try {
    const _t0 = Date.now();
    const cacheRes = await db.prepare('SELECT value FROM appConfig WHERE key = ?').bind('exchangeRateCache').all();
    const _t1 = Date.now() - _t0;
    try { console.log(`[fx] cache read exchangeRateCache in ${_t1}ms`); } catch (_) {}
    const row = firstRow(cacheRes);
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      const fetchedAt = parsed?.fetchedAt ? new Date(parsed.fetchedAt).getTime() : 0;
      const rate = Number(parsed?.usdToCLP);
      if (!isNaN(rate) && fetchedAt && (Date.now() - fetchedAt) < ttlSeconds * 1000) {
        return { usdToCLP: Number(rate), source: parsed.source || 'cache', fetchedAt: parsed.fetchedAt };
      }
    }
  } catch (e) {
    try { console.warn('[fx] cache read failed', e?.message || e); } catch(_) {}
  }

  return null;
}

async function refreshExchangeRate(env, db) {
  const rate = Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || env.EXCHANGE_RATE_FALLBACK || env.FALLBACK_USD_TO_CLP || 1000);
  const usdToCLP = Number.isFinite(rate) && rate > 0 ? rate : 1000;
  const fetchedAt = new Date().toISOString();

  if (db) {
    try {
      await ensureSchema(db);
      await db.prepare('INSERT OR REPLACE INTO appConfig (key, value, updatedAt) VALUES (?, ?, ?)')
        .bind('exchangeRateCache', JSON.stringify({ usdToCLP, source: 'manual-local', fetchedAt }), fetchedAt)
        .run();

      const id = (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : `rate-usd-clp`;
      await db.prepare(`INSERT INTO exchangeRate (id, fromCurrency, toCurrency, rate, source, fetchedAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(fromCurrency, toCurrency) DO UPDATE SET rate = excluded.rate, source = excluded.source, fetchedAt = excluded.fetchedAt, expiresAt = excluded.expiresAt;`)
        .bind(id, 'USD', 'CLP', usdToCLP, 'manual-local', fetchedAt, null).run();
    } catch (err) {
      const payload = JSON.stringify({ error: String(err), ts: fetchedAt });
      await db.prepare('INSERT OR REPLACE INTO appConfig (key, value, updatedAt) VALUES (?, ?, ?)')
        .bind('exchangeRateLastError', payload, fetchedAt)
        .run();
    }
  }

  return { usdToCLP, source: 'manual-local', fetchedAt };
}

export { getUSDtoCLPRateMetaFast, refreshExchangeRate };
