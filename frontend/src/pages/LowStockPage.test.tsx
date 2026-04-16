import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LowStockPage } from './LowStockPage';

const mockGetLowStockListings = vi.fn();

vi.mock('../services/catalog', () => ({
  getLowStockListings: (...args: unknown[]) => mockGetLowStockListings(...args),
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('LowStockPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state while request is pending', async () => {
    const deferred = createDeferred<[]>();
    mockGetLowStockListings.mockReturnValueOnce(deferred.promise);

    render(<LowStockPage />);

    expect(screen.getByText(/Cargando stock bajo/)).toBeTruthy();

    deferred.resolve([]);

    await waitFor(() => {
      expect(screen.getByText('Sin alertas con el umbral actual')).toBeTruthy();
    });
  });

  it('shows error state when request fails', async () => {
    mockGetLowStockListings.mockRejectedValueOnce(new Error('network down'));

    render(<LowStockPage />);

    await waitFor(() => {
      expect(screen.getByText('⚠️ Error al cargar stock bajo: network down')).toBeTruthy();
    });
  });

  it('shows empty state when API returns no low-stock listings', async () => {
    mockGetLowStockListings.mockResolvedValueOnce([]);

    render(<LowStockPage />);

    await waitFor(() => {
      expect(screen.getByText('Sin alertas con el umbral actual')).toBeTruthy();
      expect(screen.getByText('No hay listings activos con stock menor o igual a 5.')).toBeTruthy();
    });
  });

  it('shows table state when API returns at least one low-stock listing', async () => {
    mockGetLowStockListings.mockResolvedValueOnce([
      {
        id: 'listing-1',
        cardId: 'card-1',
        editionId: 'edition-1',
        condition: 'NM',
        quantity: 2,
        referencePrice: 4,
        marginMultiplier: 1,
        exchangeRate: 950,
        finalPrice: 3800,
        currency: 'CLP',
        status: 'active',
        card: {
          id: 'card-1',
          tcgId: 'tcg-1',
          editionId: 'edition-1',
          cardCode: 'CARD-001',
          cardName: 'Lightning Bolt',
          rarity: 'Rare',
        },
      },
    ]);

    render(<LowStockPage />);

    await waitFor(() => {
      expect(screen.getByText('1 listing(s) en alerta (umbral: 5)')).toBeTruthy();
      expect(screen.getAllByText('Lightning Bolt').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('CARD-001').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Rareza')).toBeTruthy();
      expect(screen.getAllByText('Rare').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('keeps preview fixed after pinning a low-stock card', async () => {
    mockGetLowStockListings.mockResolvedValueOnce([
      {
        id: 'listing-1',
        cardId: 'card-1',
        editionId: 'edition-1',
        condition: 'NM',
        quantity: 2,
        referencePrice: 4,
        marginMultiplier: 1,
        exchangeRate: 950,
        finalPrice: 3800,
        currency: 'CLP',
        status: 'active',
        card: {
          id: 'card-1',
          tcgId: 'tcg-1',
          editionId: 'edition-1',
          cardCode: 'CARD-001',
          cardName: 'Lightning Bolt',
          rarity: 'Rare',
          imageUrl: 'https://example.com/bolt.jpg',
        },
      },
      {
        id: 'listing-2',
        cardId: 'card-2',
        editionId: 'edition-1',
        condition: 'NM',
        quantity: 1,
        referencePrice: 6,
        marginMultiplier: 1,
        exchangeRate: 950,
        finalPrice: 5700,
        currency: 'CLP',
        status: 'active',
        card: {
          id: 'card-2',
          tcgId: 'tcg-1',
          editionId: 'edition-1',
          cardCode: 'CARD-002',
          cardName: 'Counterspell',
          rarity: 'Uncommon',
          imageUrl: 'https://example.com/counterspell.jpg',
        },
      },
    ]);

    render(<LowStockPage />);

    const previewPanel = await screen.findByText('Vista previa');
    const previewAside = previewPanel.closest('aside');
    expect(previewAside).not.toBeNull();

    await userEvent.click(screen.getAllByTitle('Fijar vista previa')[0]);
    expect(within(previewAside as HTMLElement).getByText('Lightning Bolt')).toBeTruthy();
    expect(within(previewAside as HTMLElement).getByText('Vista fija: el hover no cambia la carta')).toBeTruthy();

    // Trigger mouseEnter on the table row containing the second listing
    const rows = screen.getAllByRole('row');
    const counterspellRow = rows.find(r => within(r).queryByText('Counterspell')) as HTMLElement | undefined;
    expect(counterspellRow).toBeTruthy();
    fireEvent.mouseEnter(counterspellRow!);
    expect(within(previewAside as HTMLElement).getByText('Lightning Bolt')).toBeTruthy();
    expect(within(previewAside as HTMLElement).queryByText('Counterspell')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Fijada' }));
    // After unpinning, find the current Counterspell row and click its title
    const rowsAfter = screen.getAllByRole('row');
    const counterspellRowAfter = rowsAfter.find(r => within(r).queryByText('Counterspell')) as HTMLElement | undefined;
    expect(counterspellRowAfter).toBeTruthy();
    const titleInRowAfter = within(counterspellRowAfter!).getByTitle('Fijar vista previa');
    await userEvent.click(titleInRowAfter);

    await waitFor(() => {
      const asides = Array.from(document.querySelectorAll('aside.inventory-preview-panel'));
      const found = asides.some((a) => within(a as HTMLElement).queryByText('Counterspell'));
      expect(found).toBeTruthy();
    });
  });
});
