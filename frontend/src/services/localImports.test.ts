import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock external API clients to avoid network calls and control responses
vi.mock('./tcgcsv', () => ({
  getCardById: vi.fn(),
  searchCards: vi.fn(),
  getSetCards: vi.fn(),
}));
vi.mock('./scryfall', () => ({ getCardById: vi.fn(), searchCards: vi.fn(), getSetCards: vi.fn() }));
vi.mock('./pokemontcg', () => ({ getCardById: vi.fn(), searchCards: vi.fn(), getSetCards: vi.fn() }));
vi.mock('./ygopro', () => ({ getCardById: vi.fn(), searchCards: vi.fn(), getSetCards: vi.fn() }));
vi.mock('./optcg', () => ({ getCardById: vi.fn(), searchCards: vi.fn(), getSetCards: vi.fn() }));

import * as tcgcsv from './tcgcsv';
import * as localImports from './localImports';

const sampleCard = (id = 'card-1') => ({
  externalId: id,
  source: 'tcgcsv',
  tcg: 'MAGIC',
  cardName: `Card ${id}`,
  editionCode: 'SET1',
  editionName: 'Set 1',
} as any);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('localImports basic flows', () => {
  it('importCardLocal creates a listing and persists it', async () => {
    (tcgcsv.getCardById as any).mockResolvedValue(sampleCard('c1'));

    const res = await localImports.importCardLocal('MAGIC', 'c1', { createListing: true, quantity: 3, referencePrice: 10.5, marginMultiplier: 1.2, condition: 'NM' });
    expect(res.result.action).toBe('created');
    expect(res.result.listingId).toBeDefined();

    const listings = localImports.listLocalListings();
    expect(listings.length).toBe(1);
    expect(listings[0].quantity).toBe(3);
    expect(listings[0].card.cardName).toBe('Card c1');
  });

  it('deleteListing removes the listing', async () => {
    (tcgcsv.getCardById as any).mockResolvedValue(sampleCard('c2'));
    const r = await localImports.importCardLocal('MAGIC', 'c2', { createListing: true });
    const id = r.result.listingId!;
    expect(localImports.listLocalListings().length).toBe(1);

    localImports.deleteListing(id);
    expect(localImports.listLocalListings().length).toBe(0);
  });

  it('updateListing updates fields', async () => {
    (tcgcsv.getCardById as any).mockResolvedValue(sampleCard('c3'));
    const r = await localImports.importCardLocal('MAGIC', 'c3', { createListing: true, quantity: 1 });
    const id = r.result.listingId!;

    const updated = localImports.updateListing({ id, quantity: 7, condition: 'LP' });
    expect(updated.quantity).toBe(7);
    expect(updated.condition).toBe('LP');
  });

  it('exportLocalListingsJson and CSV contain data', async () => {
    (tcgcsv.getCardById as any).mockResolvedValue(sampleCard('c4'));
    await localImports.importCardLocal('MAGIC', 'c4', { createListing: true, quantity: 2 });

    const json = localImports.exportLocalListingsJson();
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThanOrEqual(1);

    const csv = localImports.exportLocalListingsCsv();
    expect(csv.includes('externalId')).toBe(true);
    expect(csv.includes('Card c4')).toBe(true);
  });

  it('importLocalListingsFromJson adds items', () => {
    const items = [
      { tcg: 'MAGIC', card: sampleCard('cj1'), quantity: 5, condition: 'NM', referencePrice: 2.5, marginMultiplier: 1.1 },
    ];
    const added = localImports.importLocalListingsFromJson(items as any);
    expect(added).toBe(1);
    expect(localImports.listLocalListings().some((l) => l.card.externalId === 'cj1')).toBe(true);
  });

  it('importSearchLocal uses tcgcsv.searchCards and imports results', async () => {
    const cards = [sampleCard('s1'), sampleCard('s2')];
    (tcgcsv.searchCards as any).mockResolvedValue(cards);
    // getCardById should return the corresponding card when called
    (tcgcsv.getCardById as any).mockImplementation(async (_tcg: any, id: string) => cards.find((c) => c.externalId === id));

    const res = await localImports.importSearchLocal('MAGIC', 'Card', { createListing: true });
    expect(res.total).toBe(2);
    expect(res.created).toBe(2);
    // ensure listings persisted
    const all = localImports.listLocalListings();
    expect(all.some((l) => l.card.externalId === 's1')).toBe(true);
    expect(all.some((l) => l.card.externalId === 's2')).toBe(true);
  });

  it('importSetLocal uses tcgcsv.getSetCards and imports results', async () => {
    const setCards = [sampleCard('set1'), sampleCard('set2')];
    (tcgcsv.getSetCards as any).mockResolvedValue(setCards);
    (tcgcsv.getCardById as any).mockImplementation(async (_tcg: any, id: string) => setCards.find((c) => c.externalId === id));

    const res = await localImports.importSetLocal('MAGIC', 'SET1', { createListing: true });
    expect(res.total).toBe(2);
    expect(res.created).toBe(2);
  });
});
