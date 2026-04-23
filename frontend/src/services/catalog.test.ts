import { describe, it, expect, vi } from 'vitest';
import * as svc from './catalog';
import apiClient from './api';
import * as localImports from './localImports';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    default: {
      ...actual.default,
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
});
