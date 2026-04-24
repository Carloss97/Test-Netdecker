process.env.SKIP_DB_INIT = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'net';
import express, { type Express } from 'express';
import 'express-async-errors';

import editionRoutes from './edition.routes.js';
import prisma from '../utils/db.js';

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

test('GET /api/editions/:id/cards-with-stock falls back to editionCode when id lookup misses', async () => {
  const originalFindUnique = (prisma.edition as any).findUnique;
  const originalFindFirst = (prisma.edition as any).findFirst;
  const originalCardFindMany = (prisma.card as any).findMany;
  const originalStoreFindFirst = (prisma.store as any).findFirst;
  const originalListingCreate = (prisma.listing as any).create;

  try {
    (prisma.edition as any).findUnique = async ({ where }: any) => {
      if (where?.id === 'cmo82b67m0003idqfnlj9eh8m') return null;
      if (where?.id === 'SET1') return {
        id: 'edition-1',
        editionCode: 'SET1',
        editionName: 'Set 1',
        releaseDate: null,
        isActive: true,
        tcgId: 'MAGIC',
        tcg: { id: 'MAGIC', name: 'MAGIC', displayName: 'Magic: The Gathering' },
        _count: { cards: 1, listings: 0 },
      };
      return null;
    };

    (prisma.edition as any).findFirst = async () => ({
      id: 'edition-1',
      editionCode: 'SET1',
      editionName: 'Set 1',
      releaseDate: null,
      isActive: true,
      tcgId: 'MAGIC',
      tcg: { id: 'MAGIC', name: 'MAGIC', displayName: 'Magic: The Gathering' },
    });

    (prisma.card as any).findMany = async () => ([
      {
        id: 'card-1',
        cardCode: 'C001',
        cardName: 'Test Card',
        cardNumber: '001',
        rarity: 'Rare',
        colorIdentity: null,
        imageUrl: null,
        tags: null,
        listings: [],
      },
    ]);

    (prisma.store as any).findFirst = async () => ({ id: 'store-1' });
    (prisma.listing as any).create = async ({ data }: any) => ({
      id: 'listing-1',
      condition: data.condition,
      quantity: data.quantity,
      referencePrice: data.referencePrice,
      marginMultiplier: data.marginMultiplier,
      finalPrice: data.finalPrice,
      currency: data.currency,
      lastSyncedAt: null,
      status: data.status,
    });

    const app = express();
    app.use('/api/editions', editionRoutes);

    const res = await makeRequest(app, 'GET', '/api/editions/SET1/cards-with-stock');

    assert.equal(res.status, 200);
    const body = res.body as any;
    assert.equal(body.edition.editionCode, 'SET1');
    assert.equal(body.totalCards, 1);
    assert.equal(body.cards[0].listings[0].id, 'listing-1');
  } finally {
    (prisma.edition as any).findUnique = originalFindUnique;
    (prisma.edition as any).findFirst = originalFindFirst;
    (prisma.card as any).findMany = originalCardFindMany;
    (prisma.store as any).findFirst = originalStoreFindFirst;
    (prisma.listing as any).create = originalListingCreate;
  }
});