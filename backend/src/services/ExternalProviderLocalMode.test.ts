import test from 'node:test';
import assert from 'node:assert/strict';

async function withLocalOnlyMode(fn: () => Promise<void>) {
  const originalLocalOnly = process.env.LOCAL_ONLY_MODE;
  const originalTcgcsvOnly = process.env.TCGCSV_ONLY_MODE;
  const originalStripeSecret = process.env.STRIPE_SECRET;
  const originalMercadoPagoToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const originalSkipDb = process.env.SKIP_DB_INIT;

  try {
    process.env.LOCAL_ONLY_MODE = 'true';
    process.env.TCGCSV_ONLY_MODE = 'true';
    process.env.SKIP_DB_INIT = 'true';
    delete process.env.STRIPE_SECRET;
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    await fn();
  } finally {
    if (originalLocalOnly === undefined) delete process.env.LOCAL_ONLY_MODE;
    else process.env.LOCAL_ONLY_MODE = originalLocalOnly;

    if (originalTcgcsvOnly === undefined) delete process.env.TCGCSV_ONLY_MODE;
    else process.env.TCGCSV_ONLY_MODE = originalTcgcsvOnly;

    if (originalStripeSecret === undefined) delete process.env.STRIPE_SECRET;
    else process.env.STRIPE_SECRET = originalStripeSecret;

    if (originalMercadoPagoToken === undefined) delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    else process.env.MERCADOPAGO_ACCESS_TOKEN = originalMercadoPagoToken;

    if (originalSkipDb === undefined) delete process.env.SKIP_DB_INIT;
    else process.env.SKIP_DB_INIT = originalSkipDb;
  }
}

function isExternalProviderDisabled(error: unknown): boolean {
  const err = error as { statusCode?: number; code?: string; message?: string };
  return err.statusCode === 503 && err.code === 'EXTERNAL_PROVIDER_DISABLED';
}

test('Stripe connector does not call Stripe in local TCGCSV-only mode', async () => {
  await withLocalOnlyMode(async () => {
    const { default: StripeService } = await import('./StripeService.js');

    await assert.rejects(
      () => StripeService.createPaymentIntent({ items: [{ listingId: 'listing-1', quantity: 1 }], currency: 'CLP' }),
      isExternalProviderDisabled,
    );

    const charges = await StripeService.listCharges({ gte: new Date(0), lt: new Date(1000) });
    assert.deepEqual(charges, []);
  });
});

test('MercadoPago connector does not call MercadoPago in local TCGCSV-only mode', async () => {
  await withLocalOnlyMode(async () => {
    const { default: MercadoPagoService } = await import('./MercadoPagoService.js');

    await assert.rejects(
      () => MercadoPagoService.createPreference({
        items: [{ id: 'listing-1', title: 'Local card', quantity: 1, unit_price: 1000 }],
      }),
      isExternalProviderDisabled,
    );
  });
});
