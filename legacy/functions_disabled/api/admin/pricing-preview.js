import { pickDb, ensureSchema, firstRow } from '../../_shared/d1.js';
import { calculateFinalPriceDetailed } from '../../_shared/price.js';
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
    const token = String(extractToken(request) || '');
    if (!token) return json({ success: false, error: 'Missing token' }, 401);
    const user = await validateToken(env, token);
    if (!user) return json({ success: false, error: 'Invalid token' }, 401);

    const body = request.method === 'GET' ? Object.fromEntries(new URL(request.url).searchParams.entries()) : await request.json().catch(() => ({}));
    const listingId = body.listingId || null;
    const referencePrice = body.referencePrice !== undefined ? Number(body.referencePrice) : undefined;
    const marginMultiplier = body.marginMultiplier !== undefined ? Number(body.marginMultiplier) : undefined;
    const roundingMultiple = body.roundingMultiple !== undefined ? Number(body.roundingMultiple) : undefined;

    const db = pickDb(env);
    if (db) await ensureSchema(db);

    let listing = null;
    if (listingId) {
      const sel = await db.prepare('SELECT l.id, l.cardId, l.finalPrice, l.referencePrice, l.marginMultiplier, c.cardName, c.cardCode, e.editionCode, e.editionName FROM listing l LEFT JOIN card c ON c.id = l.cardId LEFT JOIN edition e ON e.editionCode = l.editionCode WHERE l.id = ? LIMIT 1').bind(listingId).all();
      listing = Array.isArray(sel?.results) ? sel.results[0] : (Array.isArray(sel) ? sel[0] : null);
      if (!listing) return json({ success: false, error: 'Listing not found' }, 404);
    }

    const hasExplicitReferencePrice = typeof referencePrice === 'number' && Number.isFinite(referencePrice);
    const hasExplicitMarginMultiplier = typeof marginMultiplier === 'number' && Number.isFinite(marginMultiplier);

    if (!listing && (!hasExplicitReferencePrice || !hasExplicitMarginMultiplier)) {
      return json({ success: false, error: 'Provide listingId, or provide both referencePrice and marginMultiplier' }, 400);
    }

    const nextReferencePrice = hasExplicitReferencePrice ? referencePrice : listing.referencePrice;
    const nextMarginMultiplier = hasExplicitMarginMultiplier ? marginMultiplier : listing.marginMultiplier;

    if (!Number.isFinite(nextReferencePrice) || nextReferencePrice <= 0) return json({ success: false, error: 'referencePrice must be a positive number' }, 400);
    if (!Number.isFinite(nextMarginMultiplier) || nextMarginMultiplier <= 0) return json({ success: false, error: 'marginMultiplier must be a positive number' }, 400);

    const calculation = await calculateFinalPriceDetailed(env, { referencePrice: nextReferencePrice, marginMultiplier: nextMarginMultiplier, roundingMultiple });

    const currentFinalPrice = listing?.finalPrice ?? null;
    const delta = currentFinalPrice === null ? null : calculation.finalPrice - currentFinalPrice;
    const deltaPercent = currentFinalPrice === null ? null : (currentFinalPrice === 0 ? (calculation.finalPrice > 0 ? 100 : 0) : (delta / currentFinalPrice) * 100);

    // Simple volatility heuristic: if percentage change > env.PRICE_VOLATILITY_THRESHOLD (default 50%) mark volatile
    const threshold = Number(env.PRICE_VOLATILITY_THRESHOLD || 50);
    const isVolatile = deltaPercent === null ? null : Math.abs(deltaPercent) >= Number(threshold);

    return json({
      success: true,
      listing: listing ? { id: listing.id, cardId: listing.cardId, cardName: listing.cardName, cardCode: listing.cardCode, editionCode: listing.editionCode, editionName: listing.editionName, currentReferencePrice: listing.referencePrice, currentMarginMultiplier: listing.marginMultiplier, currentFinalPrice: listing.finalPrice } : null,
      preview: {
        referencePrice: nextReferencePrice,
        marginMultiplier: nextMarginMultiplier,
        exchangeRate: calculation.exchangeRate,
        exchangeRateRetrievalSource: calculation.retrievalSource,
        exchangeRateProvider: calculation.provider || null,
        exchangeRateFetchedAt: calculation.fetchedAt || null,
        exchangeRateExpiresAt: calculation.expiresAt || null,
        roundingMultiple: calculation.roundingMultiple,
        formula: calculation.formula,
        rawFinalPrice: calculation.rawFinalPrice,
        finalPrice: calculation.finalPrice,
        roundedFinalPrice: Math.round(calculation.finalPrice),
        currency: 'CLP',
      },
      diff: { delta, deltaPercent, isVolatile },
    });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default { onRequest };
