import express from 'express';
import { z } from 'zod';
import PaymentService from '../services/PaymentService.js';
import { ValidationError } from '../utils/errors.js';
import StripeService from '../services/StripeService.js';
import MercadoPagoService from '../services/MercadoPagoService.js';
import prisma from '../utils/db.js';

const router = express.Router();

const posSaleSchema = z.object({
  items: z.array(z.object({ listingId: z.string().trim().min(1), quantity: z.coerce.number().int().min(1) })).min(1),
  storeId: z.string().optional(),
  customerEmail: z.string().optional(),
  paymentMethod: z.string().optional(),
  performedBy: z.string().optional(),
  externalReference: z.string().optional(),
});

function parseBodyOrThrow<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message || 'Invalid request payload');
  return parsed.data;
}

router.post('/pos-sale', async (req, res) => {
  const body = parseBodyOrThrow(posSaleSchema, req.body);
  const order = await PaymentService.processPosSale(body as any);
  res.json({ success: true, order });
});

// Create a Stripe PaymentIntent for a cart (returns client_secret)
const createIntentSchema = z.object({
  items: z.array(z.object({ listingId: z.string().trim().min(1), quantity: z.coerce.number().int().min(1) })).min(1),
  storeId: z.string().optional(),
  currency: z.string().optional(),
});

router.post('/stripe/create-intent', async (req, res) => {
  const body = parseBodyOrThrow(createIntentSchema, req.body);
  const intent = await StripeService.createPaymentIntent({ items: body.items as any, storeId: body.storeId || null, currency: body.currency || 'CLP' });
  res.json({ success: true, clientSecret: intent.clientSecret, paymentIntentId: intent.id, amount: intent.amount, currency: intent.currency });
});

// Create Mercado Pago preference for client checkout
const mpSchema = z.object({
  items: z.array(z.object({ listingId: z.string().trim().min(1), title: z.string().optional(), quantity: z.coerce.number().int().min(1), unit_price: z.coerce.number().min(0) })).min(1),
  storeId: z.string().optional(),
  back_urls: z.record(z.string()).optional(),
});

router.post('/mercadopago/create-preference', async (req, res) => {
  const body = parseBodyOrThrow(mpSchema, req.body);
  const items = body.items.map((i: any) => ({ id: i.listingId, title: i.title || i.listingId, quantity: i.quantity, unit_price: i.unit_price }));
  try {
    const pref = await MercadoPagoService.createPreference({ items, back_urls: body.back_urls || {}, external_reference: body.storeId || undefined });
    res.json({ success: true, preference: pref });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'MercadoPago error' });
  }
});

// Stripe webhook receiver - use raw body for signature verification
export async function handleStripeWebhookEvent(event: any) {
  if (event.type !== 'payment_intent.succeeded') return { received: true };

  const intent = event.data.object as any;

  // Parse items from metadata
  const itemsJson = intent.metadata?.items || intent.metadata?.Items || null;
  if (!itemsJson) {
    // No items metadata, ignore
    return { received: true };
  }

  let items: Array<{ listingId: string; quantity: number }> = [];
  try {
    items = JSON.parse(itemsJson as string);
  } catch (err) {
    return { success: false, message: 'Invalid items metadata' };
  }

  const paymentIntentId = intent.id as string;

  // Idempotency: ensure we haven't already created an order for this payment intent
  const existing = await prisma.order.findFirst({ where: { notes: String(`stripe_intent:${paymentIntentId}`) } });
  if (existing) {
    return { received: true, note: 'Already processed' };
  }

  // Process the sale and attach externalReference
  await PaymentService.processPosSale({ items, storeId: intent.metadata?.storeId || null, paymentMethod: 'CARD', externalReference: `stripe_intent:${paymentIntentId}` } as any);

  return { received: true };
}

router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string | undefined;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || undefined;

  try {
    const event: any = await StripeService.verifyWebhookSignature(req.body as Buffer, sig, endpointSecret);
    const result = await handleStripeWebhookEvent(event);
    if ((result as any).success === false) return res.status(400).json(result);
    return res.json(result);
  } catch (err: any) {
    console.error('Stripe webhook error', err?.message || err);
    res.status(400).json({ success: false, message: 'Webhook error' });
  }
});

export default router;
