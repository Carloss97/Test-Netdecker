import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'net';
import express, { Express } from 'express';
import 'express-async-errors';

import paymentsRoutes from './payments.routes.js';
import MercadoPagoService from '../services/MercadoPagoService.js';
import WebhookQueueService from '../services/WebhookQueueService.js';

function makeRequest(app: Express, method: string, path: string, body?: string, headers?: Record<string, string>) {
  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      const port = addr.port as number;
      const url = `http://127.0.0.1:${port}${path}`;
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(body ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}),
          ...(headers || {}),
        },
      };

      const req = httpRequest(url, options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          server.close();
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ status: res.statusCode || 0, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode || 0, body: raw });
          }
        });
      });

      req.on('error', (err) => {
        server.close();
        reject(err);
      });

      if (body) req.write(body);
      req.end();
    });
  });
}

describe('MercadoPago webhook route', () => {
  test('accepts a valid signature and enqueues payload', async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'mp_test_token_123';

    const originalEnqueue = WebhookQueueService.enqueueWebhook;
    let enqueueArgs: any = null;
    WebhookQueueService.enqueueWebhook = (async (...args: any[]) => {
      enqueueArgs = args;
      return { id: 'job_1' };
    }) as typeof WebhookQueueService.enqueueWebhook;

    const app = express();
    app.use('/api/payments', paymentsRoutes);

    const payload = { type: 'payment.created', data: { object: { id: 'mp_1' } } };
    const payloadText = JSON.stringify(payload);
    const signature = MercadoPagoService.computeWebhookSignature(payloadText);
    const res = await makeRequest(app, 'POST', '/api/payments/mercadopago/webhook', payloadText, { 'x-signature': signature });

    assert.equal(res.status, 202);
    assert.equal((res.body as any).accepted, true);
    assert.deepEqual(enqueueArgs?.[0], 'MERCADOPAGO');
    assert.deepEqual(enqueueArgs?.[1], 'payment.created');
    assert.deepEqual(enqueueArgs?.[2], payload);

    WebhookQueueService.enqueueWebhook = originalEnqueue;
  });

  test('rejects an invalid signature before enqueueing', async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'mp_test_token_123';

    const originalEnqueue = WebhookQueueService.enqueueWebhook;
    let called = false;
    WebhookQueueService.enqueueWebhook = (async () => {
      called = true;
      return { id: 'job_1' };
    }) as typeof WebhookQueueService.enqueueWebhook;

    const originalWarn = console.warn;
    let warning = '';
    console.warn = (...args: any[]) => {
      warning = args.join(' ');
    };

    const app = express();
    app.use('/api/payments', paymentsRoutes);

    const payloadText = JSON.stringify({ type: 'payment.created', data: { object: { id: 'mp_2' } } });
    const res = await makeRequest(app, 'POST', '/api/payments/mercadopago/webhook', payloadText, { 'x-signature': 'bad-signature' });

    assert.equal(res.status, 403);
    assert.equal((res.body as any).message, 'Invalid MercadoPago signature');
    assert.equal(called, false);
    assert.match(warning, /MercadoPago webhook signature validation failed/);

    console.warn = originalWarn;
    WebhookQueueService.enqueueWebhook = originalEnqueue;
  });
});
