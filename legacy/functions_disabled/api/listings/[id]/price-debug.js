import { pickDb, ensureSchema } from '../../../_shared/d1.js';
import { calculateFinalPriceDetailed } from '../../../_shared/price.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { env, params } = context;
  try {
    const id = params && (params.id || params.listingId) ? String(params.id || params.listingId) : null;
    if (!id) return json({ success: false, error: 'id missing' }, 400);

    const db = pickDb(env);
    if (!db) return json({ success: false, error: 'No DB binding available' }, 500);
    await ensureSchema(db);

    const sel = await db.prepare('SELECT l.id, l.cardId, l.finalPrice, l.referencePrice, l.marginMultiplier, l.exchangeRate, l.quantity, l.condition, l.rarity, c.cardName FROM listing l LEFT JOIN card c ON c.id = l.cardId WHERE l.id = ? LIMIT 1').bind(id).all();
    const listing = Array.isArray(sel?.results) ? sel.results[0] : (Array.isArray(sel) ? sel[0] : null);
    if (!listing) return json({ success: false, error: 'Listing not found' }, 404);

    const calculation = await calculateFinalPriceDetailed(env, { referencePrice: Number(listing.referencePrice || 0), marginMultiplier: Number(listing.marginMultiplier || 1) });
    const recalculatedFinalPrice = calculation.finalPrice;
    const delta = recalculatedFinalPrice - Number(listing.finalPrice || 0);
    const deltaPercent = Number(listing.finalPrice || 0) === 0 ? 0 : (delta / Number(listing.finalPrice || 0)) * 100;

    const historyRes = await db.prepare('SELECT id, listingId, oldPrice, newPrice, percentChange, reason, changedBy, notes, createdAt FROM priceHistory WHERE listingId = ? ORDER BY createdAt DESC LIMIT 10').bind(id).all();
    const recentHistory = Array.isArray(historyRes?.results) ? historyRes.results : (Array.isArray(historyRes) ? historyRes : []);

    const threshold = Number(env.PRICE_VOLATILITY_THRESHOLD || 10);
    const isVolatile = Number.isFinite(deltaPercent) ? (Math.abs(deltaPercent) > Number(threshold)) : null;

    return json({
      listingId: listing.id,
      cardId: listing.cardId,
      cardName: listing.cardName,
      condition: listing.condition,
      quantity: listing.quantity,
      pricing: {
        storedReferencePrice: listing.referencePrice,
        storedMarginMultiplier: listing.marginMultiplier,
        storedExchangeRate: listing.exchangeRate,
        storedFinalPrice: listing.finalPrice,
        storedLastSyncedAt: listing.lastSyncedAt || null,
      },
      currentExchangeRate: {
        rate: calculation.exchangeRate,
        retrievalSource: calculation.retrievalSource,
        provider: calculation.provider || null,
        fetchedAt: calculation.fetchedAt || null,
        expiresAt: calculation.expiresAt || null,
      },
      recalculation: {
        formula: calculation.formula,
        rawRecalculatedFinalPrice: calculation.rawFinalPrice,
        recalculatedFinalPrice,
        roundedRecalculatedFinalPrice: Math.round(recalculatedFinalPrice),
        roundingMultiple: calculation.roundingMultiple,
        delta,
        deltaPercent,
        isVolatile,
      },
      recentHistory,
    });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;
