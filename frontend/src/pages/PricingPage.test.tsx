import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PricingPage } from './PricingPage';

const mockGetAvailableListings = vi.fn();
const mockSyncListingPrices = vi.fn();
const mockGetPriceVolatility = vi.fn();
const mockUpdateListingPricingMode = vi.fn();

vi.mock('../services/catalog', () => ({
  getAvailableListings: (...args: unknown[]) => mockGetAvailableListings(...args),
  syncListingPrices: (...args: unknown[]) => mockSyncListingPrices(...args),
  getPriceVolatility: (...args: unknown[]) => mockGetPriceVolatility(...args),
  updateListingPricingMode: (...args: unknown[]) => mockUpdateListingPricingMode(...args),
}));

describe('PricingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetPriceVolatility.mockResolvedValue({ success: true, total: 0, events: [] });
    mockSyncListingPrices.mockResolvedValue({ success: true, updated: 0 });
    mockUpdateListingPricingMode.mockResolvedValue({ success: true });

    mockGetAvailableListings.mockResolvedValue([
      {
        id: 'listing-1',
        cardId: 'card-1',
        editionId: 'ed-1',
        condition: 'NM',
        quantity: 2,
        referencePrice: 5,
        marginMultiplier: 1,
        exchangeRate: 950,
        finalPrice: 4750,
        currency: 'CLP',
        status: 'manual',
        card: {
          id: 'card-1',
          tcgId: 'tcg-1',
          editionId: 'ed-1',
          cardCode: 'CARD-001',
          cardName: 'Sample Card',
          rarity: 'Rare',
          tcg: { name: 'MAGIC' },
          edition: { editionName: 'Set 1', editionCode: 'S1' },
        },
      },
    ]);
  });

  it('switches from manual mode to API mode when toggle is clicked', async () => {
    render(<PricingPage />);

    const toggleButton = await screen.findByTitle('Cambiar a modo api');
    await userEvent.click(toggleButton);

    await waitFor(() => {
      expect(mockUpdateListingPricingMode).toHaveBeenCalledWith('listing-1', 'api');
    });
  });
});
