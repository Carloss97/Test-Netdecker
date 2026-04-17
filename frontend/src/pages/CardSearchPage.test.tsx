import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardSearchPage } from './CardSearchPage';

const mockSearchCards = vi.fn();
const mockSearchCardsByCode = vi.fn();
const mockGetListingsByCard = vi.fn();
const mockUpdateListingPricingMode = vi.fn();
const mockUpdateListingStock = vi.fn();

vi.mock('../services/catalog', () => ({
  searchCards: (...args: unknown[]) => mockSearchCards(...args),
  searchCardsByCode: (...args: unknown[]) => mockSearchCardsByCode(...args),
  getListingsByCard: (...args: unknown[]) => mockGetListingsByCard(...args),
  updateListingPricingMode: (...args: unknown[]) => mockUpdateListingPricingMode(...args),
  updateListingStock: (...args: unknown[]) => mockUpdateListingStock(...args),
}));

describe('CardSearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows clear validation when manual CLP price is invalid and does not send API update', async () => {
    mockSearchCards.mockResolvedValue([
      {
        id: 'card-1',
        tcgId: 'tcg-1',
        editionId: 'ed-1',
        cardCode: 'PIKA-001',
        cardName: 'Pikachu',
        rarity: 'Rare',
        edition: { id: 'ed-1', editionCode: 'SET1', editionName: 'Set 1' },
      },
    ]);

    mockGetListingsByCard.mockResolvedValue([
      {
        id: 'listing-1',
        cardId: 'card-1',
        editionId: 'ed-1',
        condition: 'NM',
        quantity: 2,
        referencePrice: 4.2,
        marginMultiplier: 1,
        exchangeRate: 950,
        finalPrice: 3990,
        currency: 'CLP',
        status: 'manual',
        card: {
          id: 'card-1',
          tcgId: 'tcg-1',
          editionId: 'ed-1',
          cardCode: 'PIKA-001',
          cardName: 'Pikachu',
          rarity: 'Rare',
        },
      },
    ]);

    render(<CardSearchPage />);

    await userEvent.type(screen.getByPlaceholderText('Ingresa nombre de carta (ej: Charizard)'), 'Pikachu');
    await userEvent.click(screen.getByRole('button', { name: '🔍 Buscar' }));

    await userEvent.click(await screen.findByRole('button', { name: '▼ Ver listings' }));

    const manualInput = await screen.findByTitle('Precio final manual en CLP');
    await userEvent.clear(manualInput);
    await userEvent.type(manualInput, '0');
    fireEvent.blur(manualInput);

    await waitFor(() => {
      expect(screen.getByText('⚠️ Ingresa un precio final en CLP valido (> 0). El precio de referencia USD se muestra aparte.')).toBeTruthy();
    });

    expect(mockUpdateListingPricingMode).not.toHaveBeenCalled();
  });

  it('updates listing stock from the search results table', async () => {
    mockSearchCards.mockResolvedValue([
      {
        id: 'card-1',
        tcgId: 'tcg-1',
        editionId: 'ed-1',
        cardCode: 'PIKA-001',
        cardName: 'Pikachu',
        rarity: 'Rare',
        imageUrl: 'https://example.com/pikachu.jpg',
        edition: { id: 'ed-1', editionCode: 'SET1', editionName: 'Set 1' },
      },
    ]);

    mockGetListingsByCard.mockResolvedValue([
      {
        id: 'listing-1',
        cardId: 'card-1',
        editionId: 'ed-1',
        condition: 'NM',
        quantity: 2,
        referencePrice: 4.2,
        marginMultiplier: 1,
        exchangeRate: 950,
        finalPrice: 3990,
        currency: 'CLP',
        status: 'active',
        card: {
          id: 'card-1',
          tcgId: 'tcg-1',
          editionId: 'ed-1',
          cardCode: 'PIKA-001',
          cardName: 'Pikachu',
          rarity: 'Rare',
        },
      },
    ]);

    mockUpdateListingStock.mockResolvedValue({ success: true, listingId: 'listing-1', quantity: 3 });

    render(<CardSearchPage />);

    await userEvent.type(screen.getByPlaceholderText('Ingresa nombre de carta (ej: Charizard)'), 'Pikachu');
    await userEvent.click(screen.getByRole('button', { name: '🔍 Buscar' }));

    await userEvent.click(await screen.findByRole('button', { name: '▼ Ver listings' }));

    await userEvent.click(screen.getByTitle('Aumentar stock'));

    await waitFor(() => {
      expect(mockUpdateListingStock).toHaveBeenCalledWith('listing-1', 'set', 3);
    });
  });
});
