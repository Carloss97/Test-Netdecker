import { describe, it, expect, vi } from 'vitest';
import * as svc from './catalog';
import apiClient from './api';
import * as localImports from './localImports';
import * as tcgcsvClient from './tcgcsv';
import * as scryfallClient from './scryfall';
import * as pokemonClient from './pokemontcg';
import * as ygoproClient from './ygopro';
import * as optcgClient from './optcg';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    default: {
      ...actual.default,
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
    },
  };
});

vi.mock('./localImports', () => ({
  default: {
    importSetLocal: vi.fn(),
  },
  importSetLocal: vi.fn(),
}));

vi.mock('./tcgcsv', () => ({
  getSetCards: vi.fn(),
  searchCards: vi.fn(),
  getCardById: vi.fn(),
  listSets: vi.fn(),
}));

vi.mock('./scryfall', () => ({
  getSetCards: vi.fn(),
  searchCards: vi.fn(),
  getCardById: vi.fn(),
}));

vi.mock('./pokemontcg', () => ({
  getSetCards: vi.fn(),
  searchCards: vi.fn(),
  getCardById: vi.fn(),
}));

vi.mock('./ygopro', () => ({
  getSetCards: vi.fn(),
  searchCards: vi.fn(),
  getCardById: vi.fn(),
}));

vi.mock('./optcg', () => ({
  getSetCards: vi.fn(),
  searchCards: vi.fn(),
  getCardById: vi.fn(),
}));

describe('catalog cart conflict handling', () => {
  it('maps 409 from addToCart to user-friendly retry message', async () => {
    (apiClient.post as any).mockRejectedValueOnce({ response: { status: 409 } });

    await expect(svc.addToCart('s1', 'l1', 1)).rejects.toThrow(
      'Tu carrito cambio, por favor revisa cantidades y vuelve a intentar.',
    );
  });

  it('maps 409 from updateCartItemQuantity to user-friendly retry message', async () => {
    (apiClient.patch as any).mockRejectedValueOnce({ response: { status: 409 } });

    await expect(svc.updateCartItemQuantity('s1', 'i1', 2)).rejects.toThrow(
      'Tu carrito cambio, por favor revisa cantidades y vuelve a intentar.',
    );
  });

  it('defaults importExternalSet to create listings when omitted', async () => {
    (apiClient.post as any).mockRejectedValueOnce(new Error('offline'));
    (localImports.importSetLocal as any).mockResolvedValue({ total: 1, created: 1, updated: 0, skipped: 0, errors: [], results: [] });

    await svc.importExternalSet({ tcg: 'MAGIC', setCode: 'SET1' });

    expect(localImports.importSetLocal).toHaveBeenCalledWith('MAGIC', 'SET1', expect.objectContaining({ createListing: true }));
  });

  it('resolves edition metadata before falling back and prefers tcgcsv for set cards', async () => {
    (apiClient.get as any).mockImplementation(async (url: string) => {
      if (url === '/editions/edition-1/cards-with-stock') {
        throw { response: { status: 404 } };
      }

      if (url === '/editions/edition-1') {
        return {
          data: {
            id: 'edition-1',
            editionCode: 'SET1',
            tcg: { id: 'MAGIC', name: 'MAGIC', displayName: 'Magic: The Gathering' },
          },
        };
      }

      throw new Error(`Unexpected GET ${url}`);
    });

    (tcgcsvClient.getSetCards as any).mockResolvedValue([
      {
        externalId: 'tcgcsv-1',
        source: 'tcgcsv',
        tcg: 'MAGIC',
        cardName: 'Fallback Card',
        cardNumber: '001',
        editionCode: 'SET1',
        editionName: 'Test Set',
      },
    ]);

    (scryfallClient.getSetCards as any).mockResolvedValue([]);
    (pokemonClient.getSetCards as any).mockResolvedValue([]);
    (ygoproClient.getSetCards as any).mockResolvedValue([]);
    (optcgClient.getSetCards as any).mockResolvedValue([]);

    const result = await svc.getEditionCardsWithStock('edition-1', 'SET1', 'MAGIC');

    expect((tcgcsvClient.getSetCards as any)).toHaveBeenCalledWith('MAGIC', 'SET1');
    expect((scryfallClient.getSetCards as any)).not.toHaveBeenCalled();
    expect(result.edition.editionCode).toBe('SET1');
    expect(result.totalCards).toBe(1);
    expect(result.cards[0].cardCode).toBe('001');
  });
});
