import { render, screen, waitFor, within } from '@testing-library/react';
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
      {
        id: 'listing-2',
        cardId: 'card-2',
        editionId: 'ed-1',
        condition: 'NM',
        quantity: 3,
        referencePrice: 6,
        marginMultiplier: 1,
        exchangeRate: 950,
        finalPrice: 5700,
        currency: 'CLP',
        status: 'active',
        card: {
          id: 'card-2',
          tcgId: 'tcg-1',
          editionId: 'ed-1',
          cardCode: 'CARD-002',
          cardName: 'Second Card',
          rarity: 'Uncommon',
          imageUrl: 'https://example.com/second-card.jpg',
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

  it('keeps preview fixed after pinning a pricing row', async () => {
    render(<PricingPage />);

    await waitFor(() => {
      expect(document.querySelector('.listings-preview-pane aside.inventory-preview-panel')).not.toBeNull();
    });
    const previewAside = document.querySelector('.listings-preview-pane aside.inventory-preview-panel') as HTMLElement | null;
    expect(previewAside).not.toBeNull();

    await userEvent.click(screen.getAllByTitle('Fijar vista previa')[0]);
    expect(within(previewAside as HTMLElement).getByText('Sample Card')).toBeTruthy();
    expect(within(previewAside as HTMLElement).getByText('Vista fija: el hover no cambia la carta')).toBeTruthy();

    // Hover the table row that contains 'Second Card'
    const rows = screen.getAllByRole('row');
    const secondRow = rows.find(r => within(r).queryByText('Second Card')) as HTMLElement | undefined;
    expect(secondRow).toBeTruthy();
    await userEvent.hover(secondRow!);
    expect(within(previewAside as HTMLElement).getByText('Sample Card')).toBeTruthy();
    expect(within(previewAside as HTMLElement).queryByText('Second Card')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Fijada' }));
    const rowsAfter = screen.getAllByRole('row');
    const secondRowAfter = rowsAfter.find(r => within(r).queryByText('Second Card')) as HTMLElement | undefined;
    expect(secondRowAfter).toBeTruthy();
    await userEvent.hover(secondRowAfter!);

    await waitFor(() => {
      expect(within(previewAside as HTMLElement).getByText('Second Card')).toBeTruthy();
    });
  });
});
