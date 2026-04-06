import { render, screen, waitFor } from '@testing-library/react';
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

    expect(screen.getByText(/Cargando stock bajo/)).toBeInTheDocument();

    deferred.resolve([]);

    await waitFor(() => {
      expect(screen.getByText('Sin alertas con el umbral actual')).toBeInTheDocument();
    });
  });

  it('shows error state when request fails', async () => {
    mockGetLowStockListings.mockRejectedValueOnce(new Error('network down'));

    render(<LowStockPage />);

    await waitFor(() => {
      expect(screen.getByText('⚠️ Error al cargar stock bajo: network down')).toBeInTheDocument();
    });
  });

  it('shows empty state when API returns no low-stock listings', async () => {
    mockGetLowStockListings.mockResolvedValueOnce([]);

    render(<LowStockPage />);

    await waitFor(() => {
      expect(screen.getByText('Sin alertas con el umbral actual')).toBeInTheDocument();
      expect(screen.getByText('No hay listings activos con stock menor o igual a 5.')).toBeInTheDocument();
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
        },
      },
    ]);

    render(<LowStockPage />);

    await waitFor(() => {
      expect(screen.getByText('1 listing(s) en alerta (umbral: 5)')).toBeInTheDocument();
      expect(screen.getByText('Lightning Bolt')).toBeInTheDocument();
      expect(screen.getAllByText('CARD-001').length).toBeGreaterThanOrEqual(1);
    });
  });
});
