import test from 'node:test';
import assert from 'node:assert/strict';
import { PriceService } from '../services/PriceService.js';
import { ExchangeRateService } from '../services/ExchangeRateService.js';

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
