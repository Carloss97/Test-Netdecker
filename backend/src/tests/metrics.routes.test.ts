import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { AddressInfo } from 'net';
import { createMetricsRouter } from '../routes/metrics.routes.js';

function startAppWithRouter(router: express.Router) {
  const app = express();
  app.use(router);
  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  return { server, url: `http://127.0.0.1:${port}` };
}

async function fetchText(url: string) {
  const res = await fetch(url);
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

test('GET / returns metrics when prom module provided', async () => {
  const fakeProm = {
    collectDefaultMetrics: () => {},
    register: {
      contentType: 'text/plain; version=0.0.4; charset=utf-8',
      metrics: async () => 'fake_metric 1\n',
    },
  };

  const { server, url } = startAppWithRouter(createMetricsRouter(fakeProm));
  try {
    const r = await fetchText(`${url}/`);
    assert.equal(r.status, 200);
    assert.ok(r.headers.get('content-type')?.includes('text/plain'));
    assert.equal(r.text, 'fake_metric 1\n');
  } finally {
    server.close();
  }
});

test('GET / returns 503 when prom module metrics throws', async () => {
  const fakeProm = {
    collectDefaultMetrics: () => {},
    register: {
      contentType: 'text/plain',
      metrics: async () => { throw new Error('metrics failure'); },
    },
  };

  const { server, url } = startAppWithRouter(createMetricsRouter(fakeProm));
  try {
    const r = await fetchText(`${url}/`);
    assert.equal(r.status, 503);
    assert.equal(r.text, 'prom-client not available');
  } finally {
    server.close();
  }
});
