import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useStorefront from './useStorefront';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock('../utils/observability', () => ({
  logClientError: vi.fn(),
  logClientInfo: vi.fn(),
}));

import apiClient from '../services/api';

describe('useStorefront', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads products on mount and exposes derived filters', async () => {
    (apiClient.get as any).mockResolvedValueOnce({
      data: {
        listings: [
          {
            id: 'listing-1',
            cardName: 'Blue Eyes White Dragon',
            editionName: 'LOB',
            tcgId: 'YUGIOH',
            rarity: 'UR',
            condition: 'NM',
            quantity: 2,
            finalPrice: 25990,
          },
        ],
      },
    });

    const { result } = renderHook(() => useStorefront());

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    expect(result.current.products).toHaveLength(1);
    expect(result.current.tcgOptions).toEqual(['ALL', 'YUGIOH']);
    expect(result.current.rarityOptions).toEqual(['ALL', 'UR']);
  });

  it('sets error state when load fails and recovers with manual reload', async () => {
    (apiClient.get as any)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        data: {
          listings: [
            {
              id: 'listing-2',
              cardName: 'Agumon',
              editionName: 'BT1',
              tcgId: 'DIGIMON',
              rarity: 'C',
              condition: 'NM',
              quantity: 4,
              finalPrice: 1490,
            },
          ],
        },
      });

    const { result } = renderHook(() => useStorefront());

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current.error).toBe('No se pudo cargar catálogo remoto.');
    expect(result.current.products).toEqual([]);

    await act(async () => {
      await result.current.reload();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    expect(result.current.products[0].cardName).toBe('Agumon');
  });

  it('reloads products when store-changed event is dispatched', async () => {
    (apiClient.get as any)
      .mockResolvedValueOnce({
        data: {
          listings: [
            {
              id: 'listing-a',
              cardName: 'Initial Card',
              editionName: 'SET-A',
              tcgId: 'MAGIC',
              rarity: 'C',
              condition: 'NM',
              quantity: 1,
              finalPrice: 1000,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          listings: [
            {
              id: 'listing-b',
              cardName: 'Updated Card',
              editionName: 'SET-B',
              tcgId: 'ONE_PIECE',
              rarity: 'R',
              condition: 'LP',
              quantity: 3,
              finalPrice: 3500,
            },
          ],
        },
      });

    const { result } = renderHook(() => useStorefront());

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.products[0].cardName).toBe('Initial Card');

    act(() => {
      window.dispatchEvent(new Event('netdecker:store-changed'));
    });

    await waitFor(() => {
      expect(result.current.products[0].cardName).toBe('Updated Card');
    });

    expect((apiClient.get as any).mock.calls.length).toBe(2);
  });
});
