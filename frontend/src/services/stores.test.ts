import { describe, it, expect, vi } from 'vitest';

// Mock the api client to observe calls
vi.mock('./api', () => ({
  default: {
    post: vi.fn(),
    patch: vi.fn(),
    get: vi.fn(),
  }
}));

import apiClient from './api';
import {
  createStore,
  updateStore,
  getStores,
  getStore,
  getStoreInventory,
  updateStoreInventory,
} from './stores';

describe('stores service', () => {
  it('calls POST /admin/stores with payload', async () => {
    (apiClient.post as any).mockResolvedValue({ data: { id: 's1', slug: 's1', name: 'Store 1' } });

    const payload = { slug: 's1', name: 'Store 1', currency: 'CLP', taxRate: 19 };
    const res = await createStore(payload as any);

    expect(apiClient.post).toHaveBeenCalledWith('/admin/stores', payload);
    expect(res.id).toBe('s1');
  });

  it('calls PATCH /admin/stores/:id with payload', async () => {
    (apiClient.patch as any).mockResolvedValue({ data: { id: 's1', name: 'Store 1b' } });

    const res = await updateStore('s1', { name: 'Store 1b' });
    expect(apiClient.patch).toHaveBeenCalledWith('/admin/stores/s1', { name: 'Store 1b' });
    expect(res.name).toBe('Store 1b');
  });

  it('calls GET /admin/stores and GET /admin/stores/:id', async () => {
    (apiClient.get as any).mockResolvedValueOnce({ data: [{ id: 's1' }] }).mockResolvedValueOnce({ data: { id: 's1' } });

    const list = await getStores();
    expect(apiClient.get).toHaveBeenCalledWith('/admin/stores');
    expect(list[0].id).toBe('s1');

    const single = await getStore('s1');
    expect(apiClient.get).toHaveBeenCalledWith('/admin/stores/s1');
    expect(single.id).toBe('s1');
  });

  it('returns stores array when API responds with envelope', async () => {
    (apiClient.get as any).mockResolvedValueOnce({ data: { success: true, stores: [{ id: 's2' }] } });

    const list = await getStores();

    expect(apiClient.get).toHaveBeenCalledWith('/admin/stores');
    expect(list).toEqual([{ id: 's2' }]);
  });

  it('returns empty list when GET /admin/stores shape is unknown', async () => {
    (apiClient.get as any).mockResolvedValueOnce({ data: { success: true, total: 0 } });

    await expect(getStores()).resolves.toEqual([]);
  });

  it('covers store inventory helper endpoints', async () => {
    (apiClient.get as any).mockResolvedValueOnce({ data: { items: [] } });
    (apiClient.post as any).mockResolvedValueOnce({ data: { success: true } });

    const inventory = await getStoreInventory('store-1');
    expect(apiClient.get).toHaveBeenCalledWith('/admin/inventory/store/store-1');
    expect(inventory).toEqual({ items: [] });

    const updated = await updateStoreInventory('store-1', 'listing-1', 8);
    expect(apiClient.post).toHaveBeenCalledWith('/admin/inventory/store/store-1', { listingId: 'listing-1', quantity: 8 });
    expect(updated).toEqual({ success: true });
  });
});
