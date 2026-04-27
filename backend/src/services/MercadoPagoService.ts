import crypto from 'crypto';
import prisma from '../utils/db.js';

export class MercadoPagoService {
  static computeWebhookSignature(payload: string): string {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
    if (!token) {
      throw new Error('MERCADOPAGO_ACCESS_TOKEN not configured');
    }

    return crypto.createHmac('sha256', token).update(payload).digest('hex');
  }

  static verifyWebhookSignature(payload: string, signature: string): boolean {
    const rawSignature = String(signature || '').trim();
    if (!rawSignature) return false;

    let computed: string;
    try {
      computed = this.computeWebhookSignature(payload);
    } catch {
      return false;
    }

    const normalizedSignature = rawSignature.replace(/^sha256=/i, '').toLowerCase();
    if (normalizedSignature.length !== computed.length) {
      return false;
    }

    return crypto.timingSafeEqual(Buffer.from(computed, 'utf8'), Buffer.from(normalizedSignature, 'utf8'));
  }

  static async createPreference(params: { items: Array<{ id: string; title: string; quantity: number; unit_price: number }>; back_urls?: Record<string,string>; external_reference?: string }) {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
    if (!accessToken) throw new Error('MERCADOPAGO_ACCESS_TOKEN not configured');

    // Try legacy `mercadopago` package first, then `@mercadopago/sdk-node`.
    const mpLegacy: any = await import('mercadopago').catch(() => null);
    const mpNewSdk: any = await import('@mercadopago/sdk-node').catch(() => null);

    if (!mpLegacy && !mpNewSdk) throw new Error('mercadopago SDK not available. Install `@mercadopago/sdk-node` or `mercadopago` package to use this connector.');

    let mercadopago: any = null;
    if (mpLegacy) {
      mercadopago = mpLegacy.default || mpLegacy;
      if (typeof mercadopago.configure === 'function') mercadopago.configure({ access_token: accessToken });
    } else {
      // Try to instantiate new SDK shape
      const SDK = mpNewSdk.default || mpNewSdk;
      if (typeof SDK === 'function') {
        // constructor-style export
        mercadopago = new SDK({ access_token: accessToken });
      } else if (SDK && typeof SDK === 'object') {
        const Ctor = SDK.MercadoPago || SDK.Mercadopago || SDK.default;
        if (typeof Ctor === 'function') mercadopago = new Ctor({ access_token: accessToken });
      }
    }

    if (!mercadopago) throw new Error('Unsupported mercadopago SDK shape');

    const items = (params.items || []).map((it) => {
      // Clean title and ensure it's not empty. MP CLP requires integer prices.
      const title = String(it.title || 'Producto POS').replace(/[^\w\s-]/g, '').trim().slice(0, 250) || 'Producto POS';
      const unit_price = Math.round(Number(it.unit_price) || 0);
      const quantity = Math.max(1, Number(it.quantity) || 1);

      return {
        id: it.id,
        title,
        quantity,
        unit_price: unit_price > 0 ? unit_price : 100, // Min 100 CLP for MP safety
        currency_id: 'CLP',
      };
    });

    const pref = {
      items,
      back_urls: params.back_urls || {},
      external_reference: params.external_reference || undefined,
      metadata: {
        items: JSON.stringify(items.map((it) => ({ listingId: it.id, quantity: it.quantity }))),
        storeId: params.external_reference || undefined,
      },
      auto_return: 'approved',
    } as any;

    try {
      // Support multiple SDK shapes
      if (mercadopago.preferences && typeof mercadopago.preferences.create === 'function') {
        const res = await mercadopago.preferences.create(pref);
        return res?.response ?? res;
      }

      if (typeof mercadopago.create === 'function') {
        const res = await mercadopago.create(pref);
        return res;
      }

      if (typeof mercadopago.request === 'function') {
        // Some SDKs expose a request helper
        const res = await mercadopago.request('post', '/checkout/preferences', pref);
        return res;
      }
    } catch (err: any) {
      console.error('[MercadoPago] createPreference error:', {
        message: err?.message,
        cause: err?.cause,
        stack: err?.stack,
        payload: JSON.stringify(pref),
      });
      throw err;
    }

    throw new Error('Unsupported mercadopago SDK API shape');
  }

  static async handleWebhook(payload: unknown) {
    return payload;
  }
}

export default MercadoPagoService;
