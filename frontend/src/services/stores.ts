import apiClient from './api';
import type { Store } from '../types';

export interface StoreCreateInput {
  slug: string;
  name: string;
  description?: string;
  apiKey?: string;
  currency?: string;
  taxRate?: number;
  settings?: any;
}

export async function createStore(input: StoreCreateInput): Promise<Store> {
  const res = await apiClient.post('/admin/stores', input);
  return res.data?.store ?? res.data;
}

export async function updateStore(id: string, input: Partial<StoreCreateInput>): Promise<Store> {
  const res = await apiClient.patch(`/admin/stores/${id}`, input);
  return res.data?.store ?? res.data;
}

export async function getStores(): Promise<Store[]> {
  const res = await apiClient.get('/admin/stores');
  // API returns { success, total, stores: [...] }
  if (res.data && Array.isArray(res.data.stores)) return res.data.stores;
  if (Array.isArray(res.data)) return res.data;
  return [];
}

export async function getStore(id: string): Promise<Store> {
  const res = await apiClient.get(`/admin/stores/${id}`);
  return res.data;
}

export async function getStoreInventory(storeId: string) {
  const res = await apiClient.get(`/admin/inventory/store/${storeId}`);
  return res.data;
}

export async function updateStoreInventory(storeId: string, listingId: string, quantity: number) {
  const res = await apiClient.post(`/admin/inventory/store/${storeId}`, { listingId, quantity });
  return res.data;
}

export default {
  createStore,
  updateStore,
  getStores,
  getStore,
};
