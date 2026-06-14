import express from 'express';
import { z } from 'zod';
import PaymentService from '../services/PaymentService.js';
import { ValidationError } from '../utils/errors.js';
import StripeService from '../services/StripeService.js';
import MercadoPagoService from '../services/MercadoPagoService.js';
import tenantResolver from '../middleware/tenantResolver.js';
import WebhookQueueService from '../services/WebhookQueueService.js';

const router = express.Router();
router.use(tenantResolver);

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
  const storeId = body.storeId || req.store?.id || null;
  const order = await PaymentService.processPosSale({ ...body, storeId } as any);
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
  const storeId = body.storeId || req.store?.id || null;
  const intent = await StripeService.createPaymentIntent({ items: body.items as any, storeId, currency: body.currency || 'CLP' });
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
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
    res.status(statusCode).json({ success: false, message: err?.message || 'MercadoPago error' });
  }
});

// Stripe webhook receiver - use raw body for signature verification
export async function handleStripeWebhookEvent(event: any) {
  try {
    return await WebhookQueueService.processWebhookPayload('STRIPE', event);
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Webhook error' };
  }
}

export async function handleMercadoPagoWebhookEvent(payload: any) {
  try {
    return await WebhookQueueService.processWebhookPayload('MERCADOPAGO', payload);
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Webhook error' };
  }
}

router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string | undefined;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || undefined;

  try {
    const event: any = await StripeService.verifyWebhookSignature(req.body as Buffer, sig, endpointSecret);
    await WebhookQueueService.enqueueWebhook('STRIPE', String(event.type || 'stripe.event'), event);
    return res.status(202).json({ success: true, accepted: true });
  } catch (err: any) {
    console.error('Stripe webhook error', err?.message || err);
    res.status(400).json({ success: false, message: 'Webhook error' });
  }
});

router.post('/mercadopago/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
    const signatureHeader = req.headers['x-signature'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    if (!MercadoPagoService.verifyWebhookSignature(rawBody, signature)) {
      console.warn('[payments] MercadoPago webhook signature validation failed');
      return res.status(403).json({ success: false, message: 'Invalid MercadoPago signature' });
    }

    const payload = rawBody ? JSON.parse(rawBody) : {};
    await WebhookQueueService.enqueueWebhook('MERCADOPAGO', String(payload?.type || payload?.topic || 'mercadopago.event'), payload);
    return res.status(202).json({ success: true, accepted: true });
  } catch (err: any) {
    console.error('MercadoPago webhook error', err?.message || err);
    res.status(400).json({ success: false, message: 'Webhook error' });
  }
});

export default router;
