import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as svc from './catalog';
import apiClient from './api';
import * as localImports from './localImports';
import * as tcgcsvClient from './tcgcsv';
import * as scryfallClient from './scryfall';
import * as pokemonClient from './pokemontcg';
import * as ygoproClient from './ygopro';
import * as optcgClient from './optcg';

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    default: {
      ...actual.default,
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

vi.mock('./localImports', () => ({
  default: {
    importSetLocal: vi.fn(),
    listLocalListings: vi.fn(),
    clearLocalListings: vi.fn(),
    importCardLocal: vi.fn(),
    importSearchLocal: vi.fn(),
    updateListing: vi.fn(),
  },
  importSetLocal: vi.fn(),
  listLocalListings: vi.fn(),
  clearLocalListings: vi.fn(),
  importCardLocal: vi.fn(),
  importSearchLocal: vi.fn(),
  updateListing: vi.fn(),
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
  listSets: vi.fn(),
}));

vi.mock('./pokemontcg', () => ({
  getSetCards: vi.fn(),
  searchCards: vi.fn(),
  getCardById: vi.fn(),
  listSets: vi.fn(),
}));

vi.mock('./ygopro', () => ({
  getSetCards: vi.fn(),
  searchCards: vi.fn(),
  getCardById: vi.fn(),
  listSets: vi.fn(),
}));

vi.mock('./optcg', () => ({
  getSetCards: vi.fn(),
  searchCards: vi.fn(),
  getCardById: vi.fn(),
  listSets: vi.fn(),
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

      if (url === '/editions/SET1/cards-with-stock') {
        return {
          data: {
            edition: {
              id: 'edition-1',
              editionCode: 'SET1',
              tcg: { id: 'MAGIC', name: 'MAGIC', displayName: 'Magic: The Gathering' },
            },
            totalCards: 1,
            cardsWithStock: 1,
            cards: [
              {
                id: 'card-1',
                cardCode: '001',
                cardName: 'Fallback Card',
                cardNumber: '001',
                rarity: 'Rare',
                listings: [],
              },
            ],
          },
        };
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

  expect((apiClient.get as any)).toHaveBeenCalledWith('/editions/edition-1/cards-with-stock');
  expect((apiClient.get as any)).toHaveBeenCalledWith('/editions/SET1/cards-with-stock');
    expect((tcgcsvClient.getSetCards as any)).not.toHaveBeenCalled();
    expect((scryfallClient.getSetCards as any)).not.toHaveBeenCalled();
    expect(result.edition.editionCode).toBe('SET1');
    expect(result.totalCards).toBe(1);
    expect(result.cards[0].cardCode).toBe('001');
  });

  it('returns tcg arrays and fallback lists for getTCGs', async () => {
    (apiClient.get as any).mockResolvedValueOnce({ data: { tcgs: [{ id: 'MAGIC' }, { id: 'POKEMON' }] } });
    await expect(svc.getTCGs()).resolves.toEqual([{ id: 'MAGIC' }, { id: 'POKEMON' }]);

    (apiClient.get as any).mockRejectedValueOnce(new Error('offline'));
    await expect(svc.getTCGs()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'MAGIC' }),
      expect.objectContaining({ id: 'WEISS_SCHWARZ' }),
    ]));
  });

  it('falls back to a minimal TCG object when getTCGById fails', async () => {
    (apiClient.get as any).mockRejectedValueOnce(new Error('offline'));

    await expect(svc.getTCGById('MAGIC')).resolves.toEqual({ id: 'MAGIC', name: 'MAGIC', displayName: 'MAGIC' });
  });

  it('normalizes listings from the available listings payload and falls back to local listings', async () => {
    (apiClient.get as any).mockResolvedValueOnce({
      data: {
        listings: [
          {
            id: 'listing-1',
            quantity: 2,
            card: {
              cardCode: 'C001',
              editionId: 'MAGIC:SET1',
              tcgId: 'MAGIC',
            },
          },
        ],
      },
    });

    const apiResult = await svc.getAvailableListings();
    expect(apiResult).toHaveLength(1);
    expect(apiResult[0].card.tcg.name).toBe('MAGIC');
    expect(apiResult[0].card.edition.editionCode).toBe('SET1');

    (apiClient.get as any).mockRejectedValueOnce(new Error('offline'));
    (localImports.listLocalListings as any).mockReturnValueOnce([
      {
        id: 'local-1',
        tcg: 'MAGIC',
        quantity: 1,
        referencePrice: 4,
        marginMultiplier: 1,
        condition: 'NM',
        card: {
          externalId: 'card-1',
          editionCode: 'SET1',
          cardNumber: '001',
          cardName: 'Local Card',
          rarity: 'Rare',
          colorIdentity: null,
          imageUrl: null,
          tags: null,
          description: null,
          tcg: 'MAGIC',
        },
      },
    ] as any);

    const fallbackResult = await svc.getAvailableListings('MAGIC', 'SET1');
    expect(fallbackResult).toHaveLength(1);
    expect(fallbackResult[0].card.cardName).toBe('Local Card');
  });

  it('filters low stock listings and clears the catalog locally when resetCatalog fails', async () => {
    (apiClient.get as any).mockRejectedValueOnce(new Error('offline'));
    (localImports.listLocalListings as any).mockReturnValueOnce([
      {
        id: 'local-low-1',
        tcg: 'MAGIC',
        quantity: 1,
        referencePrice: 4,
        marginMultiplier: 1,
        condition: 'NM',
        card: {
          externalId: 'card-1',
          editionCode: 'SET1',
          cardNumber: '001',
          cardName: 'Low Stock Card',
          rarity: 'Rare',
          colorIdentity: null,
          imageUrl: null,
          tags: null,
          description: null,
          tcg: 'MAGIC',
        },
      },
      {
        id: 'local-ok-1',
        tcg: 'MAGIC',
        quantity: 10,
        referencePrice: 4,
        marginMultiplier: 1,
        condition: 'NM',
        card: {
          externalId: 'card-2',
          editionCode: 'SET1',
          cardNumber: '002',
          cardName: 'Healthy Stock Card',
          rarity: 'Rare',
          colorIdentity: null,
          imageUrl: null,
          tags: null,
          description: null,
          tcg: 'MAGIC',
        },
      },
    ] as any);

    const lowStock = await svc.getLowStockListings(2);
    expect(lowStock).toHaveLength(1);
    expect(lowStock[0].card.cardName).toBe('Low Stock Card');

    (apiClient.post as any).mockRejectedValueOnce(new Error('offline'));
    const clearSpy = vi.spyOn(localImports, 'clearLocalListings').mockImplementation(() => {});
    await expect(svc.resetCatalog()).resolves.toEqual({ success: true, message: 'Local listings cleared (no backend available).' });
    expect(clearSpy).toHaveBeenCalledTimes(1);
    clearSpy.mockRestore();
  });

  it('covers catalog wrapper endpoints with API success responses', async () => {
    (apiClient.get as any).mockImplementation(async (url: string) => {
      switch (url) {
        case '/listings/inventory-value':
          return { data: { totalCost: 100, totalValue: 140, totalProfit: 40, itemCount: 2 } };
        case '/listings/sync-prices/runs':
          return { data: { runs: [{ id: 'run-1' }] } };
        case '/listings/sync-prices/runs/run-1':
          return { data: { id: 'run-1', status: 'completed' } };
        case '/price-history':
          return { data: [{ listingId: 'l1', price: 123, currency: 'CLP', source: 'api', recordedAt: '2026-04-23T00:00:00.000Z' }] };
        case '/admin/dashboard':
          return { data: { kpis: { catalog: { totalCards: 1 } } } };
        case '/admin/stock-alerts':
          return { data: { alerts: [{ listingId: 'l1' }] } };
        case '/admin/price-volatility':
          return { data: { success: true, total: 1, events: [{ listingId: 'l1' }] } };
        case '/admin/editions':
          return { data: [{ id: 'ed-1' }] };
        case '/admin/tcgplayer-coverage':
          return { data: { global: { totalCards: 1, coveredCards: 1, uncoveredCards: 0, coveragePercent: 100 }, byTcg: [] } };
        case '/admin/pricing-config':
          return { data: { config: { defaultMarginMultiplier: 1.5 } } };
        case '/editions/ed-1/csv-template':
          return { data: new Blob(['listingId,cardCode']) };
        default:
          throw new Error(`Unexpected GET ${url}`);
      }
    });

    (apiClient.post as any).mockImplementation(async (url: string) => {
      switch (url) {
        case '/listings/sync-prices':
          return { data: { success: true, processed: 1, updated: 1 } };
        case '/admin/pricing-config':
          return { data: { success: true, config: { defaultMarginMultiplier: 1.4 } } };
        case '/admin/catalog/bootstrap':
          return { data: { success: true, created: 1 } };
        case '/admin/catalog/sync':
          return { data: { success: true, synced: 1 } };
        case '/listings/batch-stock':
          return { data: { updated: 2 } };
        case '/admin/catalog/reset':
          return { data: { success: true, message: 'reset' } };
        default:
          throw new Error(`Unexpected POST ${url}`);
      }
    });

    await expect(svc.getInventoryValue()).resolves.toEqual({ totalCost: 100, totalValue: 140, totalProfit: 40, itemCount: 2 });
    await expect(svc.getPriceSyncRuns(10)).resolves.toEqual({ runs: [{ id: 'run-1' }] });
    await expect(svc.getPriceSyncRunById('run-1')).resolves.toEqual({ id: 'run-1', status: 'completed' });
    await expect(svc.getPriceHistory('l1', 5)).resolves.toEqual([{ listingId: 'l1', price: 123, currency: 'CLP', source: 'api', recordedAt: '2026-04-23T00:00:00.000Z' }]);
    await expect(svc.getAdminDashboard()).resolves.toEqual({ kpis: { catalog: { totalCards: 1 } } });
    await expect(svc.getStockAlerts(3)).resolves.toEqual({ alerts: [{ listingId: 'l1' }] });
    await expect(svc.getPriceVolatility(20, '7d')).resolves.toEqual({ success: true, total: 1, events: [{ listingId: 'l1' }] });
    await expect(svc.getAdminEditions()).resolves.toEqual([{ id: 'ed-1' }]);
    await expect(svc.getTcgplayerCoverage()).resolves.toEqual({ global: { totalCards: 1, coveredCards: 1, uncoveredCards: 0, coveragePercent: 100 }, byTcg: [] });
    await expect(svc.getAdminPricingConfig()).resolves.toEqual({ config: { defaultMarginMultiplier: 1.5 } });
    await expect(svc.updateAdminPricingConfig({ defaultMarginMultiplier: 1.4 })).resolves.toEqual({ success: true, config: { defaultMarginMultiplier: 1.4 } });
    await expect(svc.bootstrapCatalog({ tcg: 'MAGIC', setCode: 'SET1' })).resolves.toEqual({ success: true, created: 1 });
    await expect(svc.syncCatalog({ tcg: 'MAGIC' })).resolves.toEqual({ success: true, synced: 1 });
    await expect(svc.downloadEditionCsvTemplate('ed-1')).resolves.toBeInstanceOf(Blob);
    await expect(svc.batchUpdateStock([{ listingId: 'l1', quantity: 2 }])).resolves.toEqual({ updated: 2 });
    await expect(svc.resetCatalog()).resolves.toEqual({ success: true, message: 'reset' });
  });

  it('covers external search/set graceful fallback paths', async () => {
    (apiClient.get as any).mockImplementation(async (url: string) => {
      if (url === '/external/search') return { data: { cards: [] } };
      if (url === '/external/sets') throw new Error('offline');
      throw new Error(`Unexpected GET ${url}`);
    });

    (scryfallClient.searchCards as any).mockResolvedValue([{ externalId: 'm1' }]);
    (scryfallClient.listSets as any).mockResolvedValue([{ code: 'SET1', name: 'Set One' }]);

    await expect(svc.searchExternalCards('MAGIC', 'bolt')).resolves.toEqual(
      expect.objectContaining({ success: true, tcg: 'MAGIC', query: 'bolt' }),
    );
    await expect(svc.listExternalSets('MAGIC')).resolves.toEqual(
      expect.objectContaining({ success: true, total: 0, sets: [] }),
    );
  });

  it('covers external card/import defensive fallbacks', async () => {
    (apiClient.post as any).mockRejectedValue(new Error('offline'));

    (scryfallClient.getCardById as any).mockResolvedValue({ externalId: 'card-1' });
    (localImports.importCardLocal as any).mockResolvedValue({
      result: {
        cardId: 'card-1',
        listingId: 'listing-1',
        action: 'created',
        card: { cardName: 'Card One', editionCode: 'SET1', externalId: 'card-1' },
      },
    });
    (localImports.importSearchLocal as any).mockResolvedValue({
      total: 1,
      created: 1,
      updated: 0,
      skipped: 0,
      errors: [],
      results: [],
    });

    await expect(svc.getExternalCardById('MAGIC', 'card-1')).resolves.toEqual({ success: true, card: null });
    await expect(svc.importExternalCard({ tcg: 'MAGIC', cardId: 'card-1', createListing: true })).resolves.toEqual(
      expect.objectContaining({ success: true, result: expect.objectContaining({ cardId: 'card-1' }) }),
    );
    await expect(svc.importExternalSearch({ tcg: 'MAGIC', query: 'bolt' })).resolves.toEqual(
      expect.objectContaining({ success: true, total: 1, created: 1 }),
    );
  });

  it('covers getEditions fallback mapping and syncListingPrices local updates', async () => {
    (apiClient.get as any).mockImplementation(async (url: string) => {
      if (url === '/editions') throw new Error('offline');
      if (url === '/external/sets') {
        return { data: { sets: [{ code: 'SET1', name: 'Set One', releaseDate: '2024-01-01', totalCards: 12 }] } };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    (apiClient.post as any).mockImplementation(async (url: string) => {
      if (url === '/listings/sync-prices') throw new Error('offline');
      throw new Error(`Unexpected POST ${url}`);
    });

    (localImports.listLocalListings as any).mockReturnValue([
      { id: 'listing-1', tcg: 'MAGIC', marginMultiplier: 1.1, referencePrice: 2, quantity: 1 },
    ] as any);
    (localImports.updateListing as any).mockImplementation(() => undefined);

    const editions = await svc.getEditions({ tcgId: 'MAGIC', activeOnly: false });
    expect(editions).toHaveLength(1);
    expect(editions[0]).toMatchObject({ id: 'MAGIC:SET1', editionCode: 'SET1', editionName: 'Set One' });

    await expect(
      svc.syncListingPrices([{ listingId: 'listing-1', referencePrice: 3, marginMultiplier: 1.2 }]),
    ).resolves.toEqual({ success: true, processed: 1, updated: 1 });
    expect(localImports.updateListing).toHaveBeenCalledWith({ id: 'listing-1', referencePrice: 3, marginMultiplier: 1.2 });
  });

  it('covers inventory import/export wrappers and local import fallbacks', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, suggestedChunkSize: 200 }),
    } as any);

    (apiClient.post as any).mockImplementation(async (url: string) => {
      if (url === '/inventory/import-csv/validate') return { data: { success: true, warnings: [] } };
      if (url === '/inventory/import-csv') return { data: { success: true, imported: 3 } };
      if (url === '/inventory/imports/imp-1/rollback') throw new Error('offline');
      throw new Error(`Unexpected POST ${url}`);
    });

    (apiClient.get as any).mockImplementation(async (url: string) => {
      if (url === '/inventory/export-csv') return { data: new Blob(['inventory']) };
      if (url === '/inventory/imports') throw new Error('offline');
      if (url === '/inventory/imports/imp-1') throw new Error('offline');
      if (url === '/inventory/imports/export') return { data: new Blob(['imports']) };
      throw new Error(`Unexpected GET ${url}`);
    });

    localStorage.setItem('netdecker.local_import_jobs_v1', JSON.stringify([
      { id: 'imp-1', status: 'completed', fileName: 'import.csv' },
    ]));

    const file = new File(['a,b,c'], 'import.csv', { type: 'text/csv' });

    await expect(svc.validateInventoryCsv(file, 'qa')).resolves.toEqual({ success: true, warnings: [] });
    await expect(svc.importInventoryCsv(file, 'qa')).resolves.toEqual({ success: true, imported: 3 });
    await expect(svc.exportInventoryCsv({ scope: 'all' })).resolves.toBeInstanceOf(Blob);

    await expect(svc.getInventoryImports({ page: 1, pageSize: 20 })).resolves.toEqual(
      expect.objectContaining({ total: 1, items: [expect.objectContaining({ id: 'imp-1' })] }),
    );
    await expect(svc.getInventoryImportById('imp-1')).resolves.toEqual(expect.objectContaining({ id: 'imp-1' }));
    await expect(svc.rollbackInventoryImport('imp-1', { dryRun: true })).resolves.toEqual({ success: false, message: 'Backend not available' });
    await expect(svc.exportInventoryImportsCsv({ status: 'completed' })).resolves.toBeInstanceOf(Blob);

    global.fetch = originalFetch;
  });

  it('covers preview and inventory-value local fallback calculations', async () => {
    (apiClient.post as any).mockRejectedValueOnce(new Error('offline'));
    (apiClient.get as any).mockRejectedValueOnce(new Error('offline'));

    (localImports.listLocalListings as any).mockReturnValue([
      {
        id: 'listing-1',
        tcg: 'MAGIC',
        quantity: 2,
        referencePrice: 5,
        marginMultiplier: 1.2,
        condition: 'NM',
        card: {
          externalId: 'card-1',
          editionCode: 'SET1',
          cardNumber: '001',
          cardName: 'Value Card',
          rarity: 'Rare',
          colorIdentity: null,
          imageUrl: null,
          tags: null,
          description: null,
          tcg: 'MAGIC',
        },
      },
    ] as any);

    await expect(svc.previewListingPrice(10, 1.5)).resolves.toEqual(expect.objectContaining({ currency: 'CLP' }));
    await expect(svc.getInventoryValue()).resolves.toEqual(
      expect.objectContaining({ totalCost: expect.any(Number), totalValue: expect.any(Number), itemCount: 2 }),
    );
  });
});
