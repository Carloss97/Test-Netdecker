import prisma from '../utils/db.js';

type Item = { listingId: string; quantity: number };

export class StripeService {
  static async createPaymentIntent(params: { items: Item[]; storeId?: string | null; currency?: string }) {
    // Lazy import to avoid hard dependency during tests
    // @ts-ignore - allow dynamic runtime import when `stripe` package/types are not installed in dev
    const StripeMod: any = await import('stripe').catch(() => null);
    if (!StripeMod) throw new Error('Stripe SDK not available. Install stripe package to use this connector.');
    const Stripe = StripeMod.default || StripeMod;
    const stripe = new Stripe(process.env.STRIPE_SECRET || '', { apiVersion: '2022-11-15' });

    // Load listings and compute total
    const listingIds = params.items.map((it) => it.listingId);
    const listings = await prisma.listing.findMany({ where: { id: { in: listingIds } } });
    const listingMap: Map<string, any> = new Map(listings.map((l: any) => [String((l as any).id), l as any]));

    let subtotal = 0;
    for (const it of params.items) {
      const listing = listingMap.get(it.listingId) as any;
      if (!listing) throw new Error(`Listing not found: ${it.listingId}`);
      subtotal += Number(listing.finalPrice || 0) * Number(it.quantity || 0);
    }

    const currency = (params.currency || 'CLP').toLowerCase();

    // Amount handling: for currencies with cents (USD) multiply by 100, for CLP use integer
    const zeroDecimalCurrencies = new Set(['clp', 'jpy']);
    const amount = zeroDecimalCurrencies.has(currency) ? Math.round(subtotal) : Math.round(subtotal * 100);

    const metadata: any = {
      items: JSON.stringify(params.items),
    };
    if (params.storeId) metadata.storeId = params.storeId;

    const intent = await stripe.paymentIntents.create({
      amount,
      currency,
      metadata,
    });

    return { id: intent.id, clientSecret: intent.client_secret, amount, currency };
  }

  static verifyWebhookSignature(rawBody: Buffer, sigHeader: string | undefined, endpointSecret?: string) {
    // @ts-ignore - runtime import of stripe; allow when types/package not present
    return import('stripe').then((StripeMod: any) => {
      const Stripe = StripeMod.default || StripeMod;
      const stripe = new Stripe(process.env.STRIPE_SECRET || '', { apiVersion: '2022-11-15' });
      if (!endpointSecret) throw new Error('Stripe webhook endpoint secret not configured');
      return stripe.webhooks.constructEvent(rawBody, sigHeader || '', endpointSecret);
    });
  }
}

export default StripeService;
