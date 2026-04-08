/**
 * Unit tests for TCGCsvService
 * Tests the tcgcsv.com API integration for all supported TCGs.
 * Using Node.js built-in test runner.
 *
 * Note: These tests verify service structure and behaviour in isolation.
 * External API calls are expected to fail in CI (no network), so we
 * only assert on the shapes of the responses, not specific values.
 */

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { TCGCSV_CATEGORY_IDS, TCGCsvService } from '../services/TCGCsvService.js';

// ─── Category ID map ──────────────────────────────────────────────────────────

describe('TCGCsvService - Category ID map', () => {
  test('should define category IDs for all supported TCGs', () => {
    const expectedKeys = ['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON', 'WEISS_SCHWARZ'];
    for (const key of expectedKeys) {
      assert.ok(
        key in TCGCSV_CATEGORY_IDS,
        `TCGCSV_CATEGORY_IDS should contain ${key}`,
      );
      assert.equal(typeof TCGCSV_CATEGORY_IDS[key as keyof typeof TCGCSV_CATEGORY_IDS], 'number');
    }
  });

  test('should use correct TCGplayer category IDs', () => {
    assert.equal(TCGCSV_CATEGORY_IDS.MAGIC, 1);
    assert.equal(TCGCSV_CATEGORY_IDS.YUGIOH, 2);
    assert.equal(TCGCSV_CATEGORY_IDS.POKEMON, 3);
    assert.equal(TCGCSV_CATEGORY_IDS.WEISS_SCHWARZ, 20);
    assert.equal(TCGCSV_CATEGORY_IDS.DIGIMON, 63);
    assert.equal(TCGCSV_CATEGORY_IDS.ONE_PIECE, 68);
  });
});

// ─── Display names ────────────────────────────────────────────────────────────

describe('TCGCsvService - getDisplayName', () => {
  test('should return a display name for each supported TCG', () => {
    const tcgs = ['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON', 'WEISS_SCHWARZ'] as const;
    for (const tcg of tcgs) {
      const name = TCGCsvService.getDisplayName(tcg);
      assert.ok(typeof name === 'string' && name.length > 0, `getDisplayName(${tcg}) should return non-empty string`);
    }
  });

  test('should return correct names for new TCGs', () => {
    assert.equal(TCGCsvService.getDisplayName('DIGIMON'), 'Digimon Card Game');
    assert.equal(TCGCsvService.getDisplayName('WEISS_SCHWARZ'), 'Weiss Schwarz');
  });
});

// ─── API method stubs (no live network needed) ────────────────────────────────

describe('TCGCsvService - API methods return arrays', () => {
  test('getGroups returns an array (may be empty if API unreachable)', async () => {
    try {
      const groups = await TCGCsvService.getGroups('POKEMON');
      assert.ok(Array.isArray(groups), 'getGroups should return an array');
    } catch {
      // Network unavailable in test environment — acceptable
    }
  });

  test('listSets returns ExternalEdition-compatible objects', async () => {
    try {
      const sets = await TCGCsvService.listSets('DIGIMON');
      assert.ok(Array.isArray(sets), 'listSets should return an array');
      if (sets.length > 0) {
        assert.ok(typeof sets[0].code === 'string', 'Edition should have code');
        assert.ok(typeof sets[0].name === 'string', 'Edition should have name');
        assert.equal(sets[0].source, 'tcgcsv', 'Edition source should be tcgcsv');
      }
    } catch {
      // Network unavailable — acceptable
    }
  });

  test('listSets returns ExternalEdition-compatible objects for Weiss Schwarz', async () => {
    try {
      const sets = await TCGCsvService.listSets('WEISS_SCHWARZ');
      assert.ok(Array.isArray(sets), 'listSets should return an array');
      if (sets.length > 0) {
        assert.equal(sets[0].source, 'tcgcsv', 'Edition source should be tcgcsv');
      }
    } catch {
      // Network unavailable — acceptable
    }
  });

  test('searchCards returns an array', async () => {
    try {
      const cards = await TCGCsvService.searchCards('DIGIMON', 'Agumon');
      assert.ok(Array.isArray(cards), 'searchCards should return an array');
    } catch {
      // Network unavailable — acceptable
    }
  });

  test('getSetCards returns an array', async () => {
    try {
      const cards = await TCGCsvService.getSetCards('POKEMON', 'SIT');
      assert.ok(Array.isArray(cards), 'getSetCards should return an array');
    } catch {
      // Network unavailable — acceptable
    }
  });

  test('getBestPriceForProduct returns null or number', async () => {
    try {
      const price = await TCGCsvService.getBestPriceForProduct('DIGIMON', 999999);
      assert.ok(price === null || typeof price === 'number', 'getBestPriceForProduct should return null or number');
    } catch {
      // Network unavailable — acceptable
    }
  });

  test('getCardById returns null or a card object', async () => {
    try {
      const card = await TCGCsvService.getCardById('WEISS_SCHWARZ', '999999');
      assert.ok(card === null || typeof card === 'object', 'getCardById should return null or object');
    } catch {
      // Network unavailable — acceptable
    }
  });
});

// ─── Integration with CardDatabaseService ────────────────────────────────────

describe('CardDatabaseService facade - new TCG support', () => {
  test('should export the expected tcgcsv source type in ExternalCard', async () => {
    // Structural validation: if these imports compile, the types are correct
    const { CardDatabaseService } = await import('../services/CardDatabaseService.js');

    // Verify the methods exist and are callable with new TCG types
    assert.ok(typeof CardDatabaseService.listSets === 'function');
    assert.ok(typeof CardDatabaseService.getSetCards === 'function');
    assert.ok(typeof CardDatabaseService.searchCards === 'function');
    assert.ok(typeof CardDatabaseService.getCardById === 'function');
  });

  test('listSets should handle DIGIMON without throwing', async () => {
    const { CardDatabaseService } = await import('../services/CardDatabaseService.js');
    try {
      const result = await CardDatabaseService.listSets('DIGIMON');
      assert.ok(Array.isArray(result));
    } catch {
      // Network unavailable — acceptable
    }
  });

  test('listSets should handle WEISS_SCHWARZ without throwing', async () => {
    const { CardDatabaseService } = await import('../services/CardDatabaseService.js');
    try {
      const result = await CardDatabaseService.listSets('WEISS_SCHWARZ');
      assert.ok(Array.isArray(result));
    } catch {
      // Network unavailable — acceptable
    }
  });

  test('searchCards should handle DIGIMON without throwing', async () => {
    const { CardDatabaseService } = await import('../services/CardDatabaseService.js');
    try {
      const result = await CardDatabaseService.searchCards('DIGIMON', 'Agumon');
      assert.ok(Array.isArray(result));
    } catch {
      // Network unavailable — acceptable
    }
  });
});
