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
  const providers = [
    { name: 'exchangerate.host', url: 'https://api.exchangerate.host/convert?from=USD&to=CLP', extract: (b) => b?.result ?? (b?.rates && b.rates.CLP) },
    { name: 'exchangerate-api.com', url: 'https://api.exchangerate-api.com/v4/latest/USD', extract: (b) => b?.rates?.CLP },
    { name: 'open.er-api.com', url: 'https://open.er-api.com/v6/latest/USD', extract: (b) => b?.rates?.CLP },
  ];

  let lastErr = null;
  for (const p of providers) {
    try {
      const _t0 = Date.now();
      const res = await fetch(p.url);
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`provider ${p.name} failed: ${res.status} ${t}`);
      }
      const body = await res.json().catch(() => ({}));
      const rate = p.extract(body);
      if (rate === null || rate === undefined || typeof rate !== 'number') {
        throw new Error(`invalid rate from ${p.name}`);
      }
      const _t1 = Date.now() - _t0;
      try { console.log(`[fx] provider ${p.name} responded in ${_t1}ms`); } catch(_) {}

      const fetchedAt = new Date().toISOString();
      if (db) {
        try {
          await ensureSchema(db);
          await db.prepare('INSERT OR REPLACE INTO appConfig (key, value, updatedAt) VALUES (?, ?, ?)')
            .bind('exchangeRateCache', JSON.stringify({ usdToCLP: Number(rate), source: p.name, fetchedAt }), fetchedAt)
            .run();
        } catch (_) {
          // ignore cache write errors
        }
      }

      // also persist into exchangeRate table for compatibility with existing helpers
      if (db) {
        try {
          const id = (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : `rate-usd-clp`;
          const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString();
          await db.prepare(`INSERT INTO exchangeRate (id, fromCurrency, toCurrency, rate, source, fetchedAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(fromCurrency, toCurrency) DO UPDATE SET rate = excluded.rate, source = excluded.source, fetchedAt = excluded.fetchedAt, expiresAt = excluded.expiresAt;`)
            .bind(id, 'USD', 'CLP', Number(rate), p.name, fetchedAt, expiresAt).run();
        } catch (_) {
          // ignore write errors
        }
      }

      return { usdToCLP: Number(rate), source: p.name, fetchedAt };
    } catch (err) {
      lastErr = err;
      // try next provider
    }
  }

  // Persist last error for debugging when possible
  if (db) {
    try {
      const payload = JSON.stringify({ error: String(lastErr), ts: new Date().toISOString() });
      await db.prepare('INSERT OR REPLACE INTO appConfig (key, value, updatedAt) VALUES (?, ?, ?)')
        .bind('exchangeRateLastError', payload, new Date().toISOString())
        .run();
    } catch (_) {}
  }

  throw lastErr || new Error('all providers failed');
}

export { getUSDtoCLPRateMetaFast, refreshExchangeRate };
