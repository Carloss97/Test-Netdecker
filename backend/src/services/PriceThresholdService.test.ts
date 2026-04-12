import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import PriceThresholdService from './PriceThresholdService.js';

test('getThreshold falls back to env default when none set', async () => {
  const origFindFirst = prisma.priceVolatilityThreshold.findFirst;
  try {
    prisma.priceVolatilityThreshold.findFirst = (async () => null) as any;
    process.env.PRICE_VOLATILITY_THRESHOLD_DEFAULT = '7.5';
    const val = await PriceThresholdService.getThreshold(null, null);
    assert.equal(val, 7.5);
  } finally {
    prisma.priceVolatilityThreshold.findFirst = origFindFirst;
    delete process.env.PRICE_VOLATILITY_THRESHOLD_DEFAULT;
  }
});
