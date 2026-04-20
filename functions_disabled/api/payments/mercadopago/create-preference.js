async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return json({ success: false, error: 'items are required' }, 400);

    const accessToken = env.MERCADOPAGO_ACCESS_TOKEN || env.MP_ACCESS_TOKEN || '';
    if (!accessToken) return json({ success: false, error: 'MERCADOPAGO_ACCESS_TOKEN not configured' }, 500);

    const mpLegacy = await import('mercadopago').catch(() => null);
    const mpNewSdk = await import('@mercadopago/sdk-node').catch(() => null);
    if (!mpLegacy && !mpNewSdk) return json({ success: false, error: 'mercadopago SDK not available. Install @mercadopago/sdk-node or mercadopago package' }, 500);

    let mercadopago = null;
    if (mpLegacy) {
      mercadopago = mpLegacy.default || mpLegacy;
      if (typeof mercadopago.configure === 'function') mercadopago.configure({ access_token: accessToken });
    } else {
      const SDK = mpNewSdk.default || mpNewSdk;
      if (typeof SDK === 'function') {
        mercadopago = new SDK({ access_token: accessToken });
      } else if (SDK && typeof SDK === 'object') {
        const Ctor = SDK.MercadoPago || SDK.Mercadopago || SDK.default;
        if (typeof Ctor === 'function') mercadopago = new Ctor({ access_token: accessToken });
      }
    }

    if (!mercadopago) return json({ success: false, error: 'Unsupported mercadopago SDK shape' }, 500);

    const pref = {
      items: items.map((i) => ({ id: i.listingId || i.id || 'item', title: i.title || i.listingId || i.id || 'item', quantity: Number(i.quantity || 1), unit_price: Number(i.unit_price || 0) })),
      back_urls: body.back_urls || {},
      external_reference: body.storeId || undefined,
      auto_return: 'approved',
    };

    // Support multiple SDK shapes
    if (mercadopago.preferences && typeof mercadopago.preferences.create === 'function') {
      const res = await mercadopago.preferences.create(pref);
      return json({ success: true, preference: res?.response ?? res });
    }

    if (typeof mercadopago.create === 'function') {
      const res = await mercadopago.create(pref);
      return json({ success: true, preference: res });
    }

    if (typeof mercadopago.request === 'function') {
      const res = await mercadopago.request('post', '/checkout/preferences', pref);
      return json({ success: true, preference: res });
    }

    return json({ success: false, error: 'Unsupported mercadopago SDK API shape' }, 500);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;
