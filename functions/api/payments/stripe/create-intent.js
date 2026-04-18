import { pickDb } from '../../../../_shared/d1.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return json({ success: false, error: 'items are required' }, 400);

    const db = pickDb(env);
    if (!db) return json({ success: false, error: 'No DB binding available' }, 500);

    // Load listings
    const listingIds = Array.from(new Set(items.map((it) => String(it.listingId))));
    const placeholders = listingIds.map(() => '?').join(',');
    const res = await db.prepare(`SELECT id, finalPrice FROM listing WHERE id IN (${placeholders})`).bind(...listingIds).all();
    const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
    const map = new Map(rows.map((r) => [String(r.id), r]));

    let subtotal = 0;
    for (const it of items) {
      const lid = String(it.listingId);
      const listing = map.get(lid);
      if (!listing) return json({ success: false, error: `Listing not found: ${lid}` }, 400);
      const qty = Number(it.quantity || 0);
      if (qty <= 0) return json({ success: false, error: 'quantity must be > 0' }, 400);
      subtotal += Number(listing.finalPrice || 0) * qty;
    }

    // Dynamic import Stripe SDK
    const StripeMod = await import('stripe').catch(() => null);
    if (!StripeMod) return json({ success: false, error: 'Stripe SDK not available. Install stripe package to use this endpoint.' }, 500);
    const Stripe = StripeMod.default || StripeMod;
    const secret = env.STRIPE_SECRET || env.STRIPE_SECRET_KEY || env.STRIPE_API_KEY || '';
    if (!secret) return json({ success: false, error: 'STRIPE_SECRET not configured' }, 500);
    const stripe = new Stripe(secret, { apiVersion: '2022-11-15' });

    const currency = (body.currency || 'CLP').toLowerCase();
    const zeroDecimalCurrencies = new Set(['clp', 'jpy']);
    const amount = zeroDecimalCurrencies.has(currency) ? Math.round(subtotal) : Math.round(subtotal * 100);

    const metadata = { items: JSON.stringify(items) };
    if (body.storeId) metadata.storeId = body.storeId;

    const intent = await stripe.paymentIntents.create({ amount, currency, metadata });

    return json({ success: true, clientSecret: intent.client_secret, paymentIntentId: intent.id, amount, currency });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;
