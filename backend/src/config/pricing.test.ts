import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MARGIN_MULTIPLIER,
  parseOptionalPositiveNumber,
  resolveMarginMultiplier,
  SUPPORTED_TCGS,
} from './pricing.js';

test('DEFAULT_MARGIN_MULTIPLIER is 1.0', () => {
  assert.equal(DEFAULT_MARGIN_MULTIPLIER, 1.0);
});

test('resolveMarginMultiplier returns explicit valid value', () => {
  assert.equal(resolveMarginMultiplier(1.2), 1.2);
  assert.equal(resolveMarginMultiplier(2), 2);
});

test('resolveMarginMultiplier falls back to default for invalid values', () => {
  assert.equal(resolveMarginMultiplier(undefined), DEFAULT_MARGIN_MULTIPLIER);
  assert.equal(resolveMarginMultiplier(null), DEFAULT_MARGIN_MULTIPLIER);
  assert.equal(resolveMarginMultiplier(0), DEFAULT_MARGIN_MULTIPLIER);
  assert.equal(resolveMarginMultiplier(-1), DEFAULT_MARGIN_MULTIPLIER);
  assert.equal(resolveMarginMultiplier(Number.NaN), DEFAULT_MARGIN_MULTIPLIER);
});

test('parseOptionalPositiveNumber parses valid CLI-like values', () => {
  assert.equal(parseOptionalPositiveNumber('1.35'), 1.35);
  assert.equal(parseOptionalPositiveNumber('2'), 2);
});

test('parseOptionalPositiveNumber returns undefined for invalid CLI-like values', () => {
  assert.equal(parseOptionalPositiveNumber(undefined), undefined);
  assert.equal(parseOptionalPositiveNumber(''), undefined);
  assert.equal(parseOptionalPositiveNumber('0'), undefined);
  assert.equal(parseOptionalPositiveNumber('-5'), undefined);
  assert.equal(parseOptionalPositiveNumber('abc'), undefined);
});

test('SUPPORTED_TCGS includes all currently integrated games', () => {
  assert.deepEqual(SUPPORTED_TCGS, [
    'MAGIC',
    'POKEMON',
    'YUGIOH',
    'ONE_PIECE',
    'DIGIMON',
    'WEISS_SCHWARZ',
  ]);
});
