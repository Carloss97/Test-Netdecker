import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryPage } from './InventoryPage';

const mockGetTCGs = vi.fn();
const mockGetEditions = vi.fn();
const mockGetEditionCardsWithStock = vi.fn();
const mockBatchUpdateStock = vi.fn();
const mockDownloadEditionCsvTemplate = vi.fn();
const mockImportInventoryCsv = vi.fn();
const mockUpdateListingPricingMode = vi.fn();

vi.mock('../services/catalog', () => ({
  getTCGs: (...args: unknown[]) => mockGetTCGs(...args),
  getEditions: (...args: unknown[]) => mockGetEditions(...args),
  getEditionCardsWithStock: (...args: unknown[]) => mockGetEditionCardsWithStock(...args),
  batchUpdateStock: (...args: unknown[]) => mockBatchUpdateStock(...args),
  downloadEditionCsvTemplate: (...args: unknown[]) => mockDownloadEditionCsvTemplate(...args),
  importInventoryCsv: (...args: unknown[]) => mockImportInventoryCsv(...args),
  updateListingPricingMode: (...args: unknown[]) => mockUpdateListingPricingMode(...args),
}));

describe('InventoryPage manual mode guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetTCGs.mockResolvedValue([
      { id: 'tcg-1', name: 'MAGIC', displayName: 'Magic: The Gathering' },
    ]);

    mockGetEditions.mockResolvedValue([
      {
        id: 'ed-1',
        tcgId: 'tcg-1',
        editionCode: 'SET1',
        editionName: 'Set 1',
        isActive: true,
        tcg: { id: 'tcg-1', name: 'MAGIC', displayName: 'Magic: The Gathering' },
        cardCount: 1,
        listingCount: 1,
      },
    ]);

    mockGetEditionCardsWithStock.mockResolvedValue({
      edition: {
        id: 'ed-1',
        tcgId: 'tcg-1',
        editionCode: 'SET1',
        editionName: 'Set 1',
        isActive: true,
        tcg: { id: 'tcg-1', name: 'MAGIC', displayName: 'Magic: The Gathering' },
      },
      totalCards: 1,
      cardsWithStock: 0,
      cards: [
        {
          id: 'card-1',
          cardCode: 'C001',
          cardName: 'Test Card',
          rarity: 'Rare',
          listings: [
            {
              id: 'listing-1',
              condition: 'NM',
              quantity: 0,
              referencePrice: 5,
              marginMultiplier: 1,
              finalPrice: 3000,
              currency: 'CLP',
              status: 'active',
            },
          ],
        },
      ],
    });
  });

  it('keeps manual mode disabled when listing stock is 0', async () => {
    render(<InventoryPage />);

    await userEvent.click(await screen.findByText('Magic: The Gathering'));
    await userEvent.click(await screen.findByText('Set 1'));

    const modeButton = await screen.findByRole('button', { name: 'API' });
    await waitFor(() => {
      expect(modeButton).toBeDisabled();
    });

    expect(modeButton).toHaveAttribute('title', 'El modo manual solo se habilita para cartas con stock activo (> 0)');
    expect(mockUpdateListingPricingMode).not.toHaveBeenCalled();
  });

  it('saves manual CLP price on Enter when listing has active stock', async () => {
    mockGetEditionCardsWithStock.mockResolvedValueOnce({
      edition: {
        id: 'ed-1',
        tcgId: 'tcg-1',
        editionCode: 'SET1',
        editionName: 'Set 1',
        isActive: true,
        tcg: { id: 'tcg-1', name: 'MAGIC', displayName: 'Magic: The Gathering' },
      },
      totalCards: 1,
      cardsWithStock: 1,
      cards: [
        {
          id: 'card-1',
          cardCode: 'C001',
          cardName: 'Test Card',
          rarity: 'Rare',
          listings: [
            {
              id: 'listing-1',
              condition: 'NM',
              quantity: 3,
              referencePrice: 5,
              marginMultiplier: 1,
              finalPrice: 3000,
              currency: 'CLP',
              status: 'manual',
            },
          ],
        },
      ],
    });

    render(<InventoryPage />);

    await userEvent.click(await screen.findByText('Magic: The Gathering'));
    await userEvent.click(await screen.findByText('Set 1'));

    const manualInput = await screen.findByTitle('Precio final manual en CLP');
    await userEvent.clear(manualInput);
    await userEvent.type(manualInput, '4500{Enter}');

    await waitFor(() => {
      expect(mockUpdateListingPricingMode).toHaveBeenCalledWith('listing-1', 'manual', 4500);
    });
  });
});
