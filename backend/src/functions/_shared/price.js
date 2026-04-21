import { pickDb, ensureSchema } from './d1.js';
import { getUSDtoCLPRateMetaFast } from './exchange-rate.js';

function resolveRoundingMultiple(env, override) {
  if (typeof override === 'number' && Number.isFinite(override) && override >= 1) return Math.max(1, Math.round(override));
  const envValue = Number(env.PRICE_ROUNDING_MULTIPLE || '1');
  if (!Number.isFinite(envValue) || envValue < 1) return 1;
  return Math.max(1, Math.round(envValue));
}

function roundCommercialPrice(value, roundingMultiple) {
  if (roundingMultiple <= 1) return Math.round(value);
  return Math.round(value / roundingMultiple) * roundingMultiple;
}

async function getUSDtoCLPRateMeta(env, dbParam) {
  const db = dbParam || pickDb(env);
  if (db) await ensureSchema(db);

  // Env override
  const envRate = Number(env.EXCHANGE_RATE_USD_CLP || env.EXCHANGE_RATE || 0);
  if (Number.isFinite(envRate) && envRate > 0) {
    return { rate: envRate, retrievalSource: 'env', provider: 'env', fetchedAt: new Date(), expiresAt: null };
  }

  // Try DB
  // Prefer appConfig cache when present (fast path)
  if (db) {
    try {
      const meta = await getUSDtoCLPRateMetaFast(env, db);
      if (meta && Number.isFinite(Number(meta.usdToCLP)) && Number(meta.usdToCLP) > 0) {
        return { rate: Number(meta.usdToCLP), retrievalSource: 'cache', provider: meta.source || null, fetchedAt: meta.fetchedAt ? new Date(meta.fetchedAt) : undefined, expiresAt: null };
      }
    } catch (_) {
      // ignore cache read failures
    }

    try {
      const res = await db.prepare('SELECT id, fromCurrency, toCurrency, rate, source, fetchedAt, expiresAt FROM exchangeRate WHERE fromCurrency = ? AND toCurrency = ? LIMIT 1').bind('USD', 'CLP').all();
      const row = Array.isArray(res?.results) ? res.results[0] : (Array.isArray(res) ? res[0] : null);
      if (row && row.rate) {
        // If expiresAt exists and is in the future, return
        if (!row.expiresAt || new Date(row.expiresAt).getTime() > Date.now()) {
          return { rate: Number(row.rate), retrievalSource: 'database', provider: row.source || null, fetchedAt: row.fetchedAt ? new Date(row.fetchedAt) : undefined, expiresAt: row.expiresAt ? new Date(row.expiresAt) : null };
        }
      }
    } catch (err) {
      // ignore
    }
  }

  // Fetch from external API
  try {
    const apiUrl = env.EXCHANGE_RATE_API_URL || 'https://api.exchangerate-api.com/v4/latest';
    const resp = await fetch(`${apiUrl}/USD`);
    if (resp && resp.ok) {
      const json = await resp.json();
      const rate = json?.rates?.CLP || json?.rates?.CLP || null;
      if (rate) {
        // store in DB if present
        if (db) {
          try {
            const id = (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : `rate-usd-clp`;
            const fetchedAt = new Date().toISOString();
            const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString();
            await db.prepare(`INSERT INTO exchangeRate (id, fromCurrency, toCurrency, rate, source, fetchedAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(fromCurrency, toCurrency) DO UPDATE SET rate = excluded.rate, source = excluded.source, fetchedAt = excluded.fetchedAt, expiresAt = excluded.expiresAt;`)
              .bind(id, 'USD', 'CLP', Number(rate), apiUrl, fetchedAt, expiresAt).run();
          } catch (_) {}
        }
        return { rate: Number(rate), retrievalSource: 'api', provider: apiUrl, fetchedAt: new Date(), expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 6) };
      }
    }
  } catch (err) {
    // ignore
  }

  // Fallback hard-coded rate
  return { rate: Number(env.EXCHANGE_RATE_FALLBACK || 850), retrievalSource: 'fallback', provider: null, fetchedAt: new Date(), expiresAt: null };
}

async function getUSDtoCLPRate(env, db) {
  const meta = await getUSDtoCLPRateMeta(env, db);
  return meta.rate;
}

async function calculateFinalPrice(env, input) {
  const { referencePrice, marginMultiplier, roundingMultiple } = input;
  const rateMeta = await getUSDtoCLPRateMeta(env);
  const rawFinalPrice = referencePrice * marginMultiplier * rateMeta.rate;
  const rm = resolveRoundingMultiple(env, roundingMultiple);
  const finalPrice = roundCommercialPrice(rawFinalPrice, rm);
  return { finalPrice, rawFinalPrice, exchangeRate: rateMeta.rate, referencePrice, roundingMultiple: rm };
}

async function calculateFinalPriceDetailed(env, input) {
  const { referencePrice, marginMultiplier, roundingMultiple } = input;
  const rateMeta = await getUSDtoCLPRateMeta(env);
  const rawFinalPrice = referencePrice * marginMultiplier * rateMeta.rate;
  const rm = resolveRoundingMultiple(env, roundingMultiple);
  const finalPrice = roundCommercialPrice(rawFinalPrice, rm);
  return {
    finalPrice,
    rawFinalPrice,
    exchangeRate: rateMeta.rate,
    referencePrice,
    roundingMultiple: rm,
    marginMultiplier,
    retrievalSource: rateMeta.retrievalSource,
    provider: rateMeta.provider || null,
    fetchedAt: rateMeta.fetchedAt || null,
    expiresAt: rateMeta.expiresAt || null,
    formula: `${referencePrice} * ${marginMultiplier} * ${rateMeta.rate}`,
  };
}

export { getUSDtoCLPRateMeta, getUSDtoCLPRate, calculateFinalPrice, calculateFinalPriceDetailed };
