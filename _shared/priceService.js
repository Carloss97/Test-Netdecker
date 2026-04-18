import { ensureSchema, firstRow } from './d1.js';

function resolveRoundingMultiple(env, override) {
  if (typeof override === 'number' && Number.isFinite(override) && override >= 1) return Math.max(1, Math.round(override));
  const envValue = Number((env && env.PRICE_ROUNDING_MULTIPLE) || process.env.PRICE_ROUNDING_MULTIPLE || '1');
  if (!Number.isFinite(envValue) || envValue < 1) return 1;
  return Math.max(1, Math.round(envValue));
}

function roundCommercialPrice(value, roundingMultiple) {
  if (roundingMultiple <= 1) return Math.round(value);
  return Math.round(value / roundingMultiple) * roundingMultiple;
}

export async function calculateFinalPrice(env, { referencePrice, marginMultiplier, roundingMultiple }) {
  const usdToClp = Number((env && (env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP)) || process.env.MANUAL_USD_TO_CLP || 950);
  const rawFinalPrice = referencePrice * marginMultiplier * usdToClp;
  const resolved = resolveRoundingMultiple(env, roundingMultiple);
  const finalPrice = roundCommercialPrice(rawFinalPrice, resolved);
  return { finalPrice, rawFinalPrice, exchangeRate: usdToClp, referencePrice, roundingMultiple: resolved };
}

export async function updateListingPrice(db, env, listingId, newReferencePrice, marginMultiplier, reason = 'sync', changedBy = null, notes = null, roundingMultiple = undefined) {
  if (!db) throw new Error('No DB available');
  await ensureSchema(db);

  const sel = await db.prepare('SELECT id, finalPrice, referencePrice, exchangeRate FROM listing WHERE id = ?').bind(listingId).all();
  const listing = firstRow(sel);
  if (!listing) throw new Error(`Listing not found: ${listingId}`);

  const oldPrice = Number(listing.finalPrice || 0);
  const calculation = await calculateFinalPrice(env, { referencePrice: Number(newReferencePrice), marginMultiplier: Number(marginMultiplier), roundingMultiple });

  const percentChange = oldPrice === 0 ? (calculation.finalPrice > 0 ? 100 : 0) : ((calculation.finalPrice - oldPrice) / oldPrice) * 100;

  // Update listing
  try {
    await db.prepare('UPDATE listing SET referencePrice = ?, marginMultiplier = ?, finalPrice = ?, exchangeRate = ?, lastSyncedAt = ? WHERE id = ?')
      .bind(Number(newReferencePrice), Number(marginMultiplier), calculation.finalPrice, calculation.exchangeRate, new Date().toISOString(), listingId).run();
  } catch (e) {
    throw e;
  }

  // Insert history
  const phId = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `PH-${Date.now()}-${Math.floor(Math.random()*10000)}`;
  try {
    await db.prepare('INSERT INTO priceHistory (id, listingId, oldPrice, newPrice, oldReferencePrice, newReferencePrice, oldExchangeRate, newExchangeRate, reason, percentChange, changedBy, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(phId, listingId, oldPrice, calculation.finalPrice, listing.referencePrice ?? null, Number(newReferencePrice), listing.exchangeRate ?? null, calculation.exchangeRate, reason, percentChange, changedBy || null, notes || null, new Date().toISOString()).run();
  } catch (_) {}

  return {
    listingId,
    finalPrice: calculation.finalPrice,
    exchangeRate: calculation.exchangeRate,
    percentChange,
  };
}

export default { calculateFinalPrice, updateListingPrice };
