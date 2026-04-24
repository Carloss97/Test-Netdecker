import test from 'node:test';
import assert from 'node:assert/strict';
import { PriceService } from '../services/PriceService.js';
import { ExchangeRateService } from '../services/ExchangeRateService.js';
import prisma from '../utils/db.js';
import AuditService from '../services/AuditService.js';
import { PriceUpdateReason } from '@prisma/client';

test('resolveRoundingMultiple respects override and env', () => {
  const orig = process.env.PRICE_ROUNDING_MULTIPLE;
  try {
    process.env.PRICE_ROUNDING_MULTIPLE = '10';
    assert.equal(PriceService.resolveRoundingMultiple(), 10);
    assert.equal(PriceService.resolveRoundingMultiple(50), 50);
    process.env.PRICE_ROUNDING_MULTIPLE = '0';
    assert.equal(PriceService.resolveRoundingMultiple(), 1);
  } finally {
    process.env.PRICE_ROUNDING_MULTIPLE = orig;
  }
});

test('isVolatileChange computes percent change correctly', async () => {
  assert.equal(await PriceService.isVolatileChange(100, 120, 10), true);
  assert.equal(await PriceService.isVolatileChange(100, 108, 10), false);
  assert.equal(await PriceService.isVolatileChange(0, 100, 10), false);
});

test('calculateFinalPrice uses ExchangeRateService and rounding', async () => {
  const orig = ExchangeRateService.getUSDtoCLPRate;
  try {
    (ExchangeRateService as any).getUSDtoCLPRate = async () => 1000;

    const res = await PriceService.calculateFinalPrice({ referencePrice: 1, marginMultiplier: 1.2, roundingMultiple: 10 });
    assert.equal(res.rawFinalPrice, 1 * 1.2 * 1000);
    assert.equal(res.exchangeRate, 1000);
    assert.equal(res.finalPrice, Math.round(res.rawFinalPrice / 10) * 10);
  } finally {
    (ExchangeRateService as any).getUSDtoCLPRate = orig;
  }
});

test('calculateFinalPriceDetailed returns metadata from ExchangeRateService.getUSDtoCLPRateMeta', async () => {
  const origMeta = (ExchangeRateService as any).getUSDtoCLPRateMeta;
  try {
    (ExchangeRateService as any).getUSDtoCLPRateMeta = async () => ({ rate: 850, retrievalSource: 'api', provider: 'test', fetchedAt: new Date(), expiresAt: null });

    const out = await PriceService.calculateFinalPriceDetailed({ referencePrice: 2, marginMultiplier: 1.5 });
    assert.equal(out.exchangeRate, 850);
    assert.equal(out.marginMultiplier, 1.5);
    assert.ok(out.formula.includes('2'));
  } finally {
    (ExchangeRateService as any).getUSDtoCLPRateMeta = origMeta;
  }
});

test('updateListingPrice recalculates and records history', async () => {
  const originalFindUnique = prisma.listing.findUnique;
  const originalListingUpdate = prisma.listing.update;
  const originalPriceHistoryCreate = prisma.priceHistory.create;
  const originalTransaction = prisma.$transaction;
  const originalAudit = AuditService.auditEntityChange;

  try {
    prisma.listing.findUnique = (async () => ({
      id: 'L1',
      finalPrice: 100,
      referencePrice: 10,
      exchangeRate: 1,
      marginMultiplier: 1,
    })) as any;
    prisma.listing.update = (async (args: any) => ({ id: args.where.id, ...args.data })) as any;
    prisma.priceHistory.create = (async (args: any) => ({ id: 'PH1', ...args.data })) as any;
    prisma.$transaction = (async (operations: any[]) => Promise.all(operations)) as any;
    AuditService.auditEntityChange = (async () => undefined) as any;

    const originalCalculate = ExchangeRateService.getUSDtoCLPRate;
    (ExchangeRateService as any).getUSDtoCLPRate = async () => 1000;

    await PriceService.updateListingPrice('L1', 20, 1.5, PriceUpdateReason.MANUAL_UPDATE, 'u-1', 'notes', 10);

    (ExchangeRateService as any).getUSDtoCLPRate = originalCalculate;
    assert.ok(true);
  } finally {
    prisma.listing.findUnique = originalFindUnique;
    prisma.listing.update = originalListingUpdate;
    prisma.priceHistory.create = originalPriceHistoryCreate;
    prisma.$transaction = originalTransaction;
    AuditService.auditEntityChange = originalAudit;
  }
});

test('updateListingPrice throws when listing is missing', async () => {
  const originalFindUnique = prisma.listing.findUnique;
  try {
    prisma.listing.findUnique = (async () => null) as any;
    await assert.rejects(() => PriceService.updateListingPrice('missing', 20, 1.5, PriceUpdateReason.MANUAL_UPDATE));
  } finally {
    prisma.listing.findUnique = originalFindUnique;
  }
});

test('getPriceHistory and getPriceHistoryForExport pass filters to prisma', async () => {
  const originalFindMany = prisma.priceHistory.findMany;
  try {
    let calls: any[] = [];
    prisma.priceHistory.findMany = (async (args: any) => {
      calls.push(args);
      return [{ id: 'H1' }];
    }) as any;

    await PriceService.getPriceHistory('L1', 5);
    await PriceService.getPriceHistoryForExport({ listingId: 'L1', from: new Date('2026-04-01T00:00:00.000Z'), to: new Date('2026-04-23T00:00:00.000Z') });

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], {
      where: { listingId: 'L1' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    assert.deepEqual(calls[1], {
      where: {
        listingId: 'L1',
        createdAt: {
          gte: new Date('2026-04-01T00:00:00.000Z'),
          lte: new Date('2026-04-23T00:00:00.000Z'),
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  } finally {
    prisma.priceHistory.findMany = originalFindMany;
  }
});
