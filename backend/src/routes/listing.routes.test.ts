process.env.SKIP_DB_INIT = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'net';
import express, { type Express } from 'express';
import 'express-async-errors';

import listingRoutes from './listing.routes.js';
import { ListingService } from '../services/ListingService.js';

function makeRequest(app: Express, method: string, path: string) {
  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      const url = `http://127.0.0.1:${addr.port}${path}`;

      const req = httpRequest(url, { method }, (res) => {
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

      req.end();
    });
  });
}

test('GET /api/listings/available works without tenant credentials', async () => {
  const originalGetAvailableListings = ListingService.getAvailableListings;

  try {
    ListingService.getAvailableListings = (async () => ([{ id: 'listing-1', quantity: 2 }])) as typeof ListingService.getAvailableListings;

    const app = express();
    app.use(express.json());
    app.use('/api/listings', listingRoutes);

    const res = await makeRequest(app, 'GET', '/api/listings/available');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, [{ id: 'listing-1', quantity: 2 }]);
  } finally {
    ListingService.getAvailableListings = originalGetAvailableListings;
  }
});