import { describe, expect, it } from 'vitest';
import { formatInventoryIdentifier } from './cardIdentifier';

describe('formatInventoryIdentifier', () => {
  it('collapses duplicated OP01 prefix', () => {
    expect(formatInventoryIdentifier({ cardCode: 'OP01-OP01-002' })).toBe('OP01-002');
  });

  it('collapses duplicated ABYR prefix', () => {
    expect(formatInventoryIdentifier({ cardCode: 'ABYR-ABYR-EN002' })).toBe('ABYR-EN002');
  });

  it('collapses duplicated AD-01 prefix', () => {
    expect(formatInventoryIdentifier({ cardCode: 'AD-01-AD1-001 R' })).toBe('AD1-001 R');
  });

  it('collapses duplicated FT/ prefix', () => {
    expect(formatInventoryIdentifier({ cardCode: 'FT/-FT/S120-E001S SR' })).toBe('FT/S120-E001S SR');
  });

  it('extracts structured code from card name when cardCode is numeric', () => {
    expect(formatInventoryIdentifier({ cardCode: '684397', cardName: 'Greymon - AD1-001' })).toBe('AD1-001');
  });

  it('cleans duplicated prefixes even with spaces around separators', () => {
    expect(formatInventoryIdentifier({ cardCode: 'AD - 01 - AD1 - 001 R' })).toBe('AD1-001 R');
  });
});
