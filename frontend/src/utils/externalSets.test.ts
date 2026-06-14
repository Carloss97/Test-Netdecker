import { describe, expect, it } from 'vitest';
import {
  getExternalSetImportCode,
  getExternalSetRowKey,
  normalizeExternalSet,
} from './externalSets';

describe('external set UI helpers', () => {
  it('builds unique row keys for duplicate public set codes', () => {
    const first = normalizeExternalSet({ code: 'SRL-EN', groupId: 101, name: 'Starter Set A' });
    const second = normalizeExternalSet({ code: 'SRL-EN', groupId: 102, name: 'Starter Set B' });

    expect(getExternalSetRowKey('YUGIOH', first, 0)).not.toBe(getExternalSetRowKey('YUGIOH', second, 1));
    expect(getExternalSetRowKey('YUGIOH', first, 0)).toContain('101');
    expect(getExternalSetRowKey('YUGIOH', second, 1)).toContain('102');
  });

  it('uses groupId as import code so duplicate abbreviations can target the exact TCGCSV group', () => {
    const set = normalizeExternalSet({ code: 'PSV-EN', groupId: 24567, name: 'Pharaoh Servant' });

    expect(set?.code).toBe('PSV-EN');
    expect(getExternalSetImportCode(set!)).toBe('24567');
  });

  it('keeps legacy code import behavior when no groupId is available', () => {
    const set = normalizeExternalSet({ code: 'MH3', name: 'Modern Horizons 3' });

    expect(getExternalSetImportCode(set!)).toBe('MH3');
    expect(getExternalSetRowKey('MAGIC', set!, 0)).toContain('MH3');
  });
});
