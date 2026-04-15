import test from 'node:test';
import assert from 'node:assert/strict';
import { PriceService } from './PriceService.js';

// ────────────────────────────────────────────────────────────────────────────
// PriceService.resolveRoundingMultiple
// ────────────────────────────────────────────────────────────────────────────

test('resolveRoundingMultiple returns override when valid', () => {
  assert.equal(PriceService.resolveRoundingMultiple(50), 50);
  assert.equal(PriceService.resolveRoundingMultiple(10), 10);
  assert.equal(PriceService.resolveRoundingMultiple(1), 1);
});

test('resolveRoundingMultiple falls back to 1 when override is 0', () => {
  assert.equal(PriceService.resolveRoundingMultiple(0), 1);
});

test('resolveRoundingMultiple falls back to 1 when override is negative', () => {
  assert.equal(PriceService.resolveRoundingMultiple(-5), 1);
});

test('resolveRoundingMultiple rounds fractional overrides', () => {
  assert.equal(PriceService.resolveRoundingMultiple(9.7), 10);
  assert.equal(PriceService.resolveRoundingMultiple(9.2), 9);
});

test('resolveRoundingMultiple reads PRICE_ROUNDING_MULTIPLE env var when no override', () => {
  const originalEnv = process.env.PRICE_ROUNDING_MULTIPLE;
  try {
    process.env.PRICE_ROUNDING_MULTIPLE = '100';
    assert.equal(PriceService.resolveRoundingMultiple(), 100);
  } finally {
    process.env.PRICE_ROUNDING_MULTIPLE = originalEnv;
  }
});

test('resolveRoundingMultiple defaults to 1 when env var is missing', () => {
  const originalEnv = process.env.PRICE_ROUNDING_MULTIPLE;
  try {
    delete process.env.PRICE_ROUNDING_MULTIPLE;
    assert.equal(PriceService.resolveRoundingMultiple(), 1);
  } finally {
    process.env.PRICE_ROUNDING_MULTIPLE = originalEnv;
  }
});

test('resolveRoundingMultiple defaults to 1 when env var is invalid', () => {
  const originalEnv = process.env.PRICE_ROUNDING_MULTIPLE;
  try {
    process.env.PRICE_ROUNDING_MULTIPLE = 'not-a-number';
    assert.equal(PriceService.resolveRoundingMultiple(), 1);
  } finally {
    process.env.PRICE_ROUNDING_MULTIPLE = originalEnv;
  }
});

// ────────────────────────────────────────────────────────────────────────────
// PriceService.isVolatileChange
// ────────────────────────────────────────────────────────────────────────────

test('isVolatileChange returns false for small increases', async () => {
  assert.equal(await PriceService.isVolatileChange(1000, 1050), false); // +5%
});

test('isVolatileChange returns false for small decreases', async () => {
  assert.equal(await PriceService.isVolatileChange(1000, 960), false); // -4%
});

test('isVolatileChange returns true for large increase', async () => {
  assert.equal(await PriceService.isVolatileChange(1000, 1200), true); // +20%
});

test('isVolatileChange returns true for large decrease', async () => {
  assert.equal(await PriceService.isVolatileChange(1000, 800), true); // -20%
});

test('isVolatileChange uses default 10% threshold', async () => {
  assert.equal(await PriceService.isVolatileChange(1000, 1100), false); // exactly 10%, not > 10%
  assert.equal(await PriceService.isVolatileChange(1000, 1101), true);  // just over 10%
});

test('isVolatileChange respects custom threshold', async () => {
  assert.equal(await PriceService.isVolatileChange(1000, 1200, 25), false); // 20% < 25%
  assert.equal(await PriceService.isVolatileChange(1000, 1300, 25), true);  // 30% > 25%
});

test('isVolatileChange handles zero old price gracefully', async () => {
  // First priced import is treated as non-volatile by service contract.
  const result = await PriceService.isVolatileChange(0, 100);
  assert.equal(result, false);
});
