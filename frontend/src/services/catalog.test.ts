import { describe, it, expect, vi } from 'vitest';
import * as svc from './catalog';
import apiClient from './api';

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
});
