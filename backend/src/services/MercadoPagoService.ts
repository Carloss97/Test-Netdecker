import prisma from '../utils/db.js';

export class MercadoPagoService {
  static async createPreference(params: { items: Array<{ id: string; title: string; quantity: number; unit_price: number }>; back_urls?: Record<string,string>; external_reference?: string }) {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
    if (!accessToken) throw new Error('MERCADOPAGO_ACCESS_TOKEN not configured');

    // Dynamic import so SDK is optional in dev environments
    const mpMod: any = await import('mercadopago').catch(() => null);
    if (!mpMod) throw new Error('mercadopago SDK not available. Install `mercadopago` package to use this connector.');

    const mercadopago = mpMod.default || mpMod;
    mercadopago.configure({ access_token: accessToken });

    const pref = {
      items: params.items.map((it) => ({ id: it.id, title: it.title, quantity: it.quantity, unit_price: it.unit_price })),
      back_urls: params.back_urls || {},
      external_reference: params.external_reference || undefined,
      auto_return: 'approved',
    } as any;

    const res = await mercadopago.preferences.create(pref);
    return res?.response ?? res;
  }
}

export default MercadoPagoService;
