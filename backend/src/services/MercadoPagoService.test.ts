import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

import MercadoPagoService from './MercadoPagoService.js';

describe('MercadoPagoService webhook signature verification', () => {
  test('computes and verifies a valid signature', () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'mp_test_token_123';

    const payload = '{"type":"payment","id":"evt_1"}';
    const signature = MercadoPagoService.computeWebhookSignature(payload);

    assert.equal(MercadoPagoService.verifyWebhookSignature(payload, signature), true);
    assert.equal(MercadoPagoService.verifyWebhookSignature(payload, `sha256=${signature}`), true);
  });

  test('rejects invalid or missing signatures', () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'mp_test_token_123';

    const payload = '{"type":"payment","id":"evt_1"}';

    assert.equal(MercadoPagoService.verifyWebhookSignature(payload, ''), false);
    assert.equal(MercadoPagoService.verifyWebhookSignature(payload, 'deadbeef'), false);
    assert.equal(MercadoPagoService.verifyWebhookSignature(payload, 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'), false);
  });
});
