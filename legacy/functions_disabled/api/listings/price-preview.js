import { calculateFinalPriceDetailed } from '../../_shared/price.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const referencePrice = body.referencePrice !== undefined ? Number(body.referencePrice) : undefined;
    const marginMultiplier = body.marginMultiplier !== undefined ? Number(body.marginMultiplier) : undefined;
    const roundingMultiple = body.roundingMultiple !== undefined ? Number(body.roundingMultiple) : undefined;

    if (typeof referencePrice !== 'number' || referencePrice <= 0) return json({ success: false, error: 'referencePrice must be a positive number' }, 400);
    if (typeof marginMultiplier !== 'number' || marginMultiplier <= 0) return json({ success: false, error: 'marginMultiplier must be a positive number' }, 400);

    const calculation = await calculateFinalPriceDetailed(env, { referencePrice, marginMultiplier, roundingMultiple });

    return json({
      referencePrice,
      marginMultiplier,
      exchangeRate: calculation.exchangeRate,
      exchangeRateRetrievalSource: calculation.retrievalSource,
      exchangeRateProvider: calculation.provider || null,
      exchangeRateFetchedAt: calculation.fetchedAt || null,
      exchangeRateExpiresAt: calculation.expiresAt || null,
      finalPrice: calculation.finalPrice,
      rawFinalPrice: calculation.rawFinalPrice,
      formula: calculation.formula,
      roundedFinalPrice: Math.round(calculation.finalPrice),
      roundingMultiple: calculation.roundingMultiple,
      currency: 'CLP',
    });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;
