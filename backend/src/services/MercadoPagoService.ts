import prisma from '../utils/db.js';

export class MercadoPagoService {
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

    const pref = {
      items: params.items.map((it) => ({ id: it.id, title: it.title, quantity: it.quantity, unit_price: it.unit_price })),
      back_urls: params.back_urls || {},
      external_reference: params.external_reference || undefined,
      auto_return: 'approved',
    } as any;

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

    throw new Error('Unsupported mercadopago SDK API shape');
  }
}

export default MercadoPagoService;
