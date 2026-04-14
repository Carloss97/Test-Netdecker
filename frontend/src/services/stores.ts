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
  return res.data;
}

export async function updateStore(id: string, input: Partial<StoreCreateInput>): Promise<Store> {
  const res = await apiClient.patch(`/admin/stores/${id}`, input);
  return res.data;
}

export async function getStores(): Promise<Store[]> {
  const res = await apiClient.get('/admin/stores');
  return res.data;
}

export async function getStore(id: string): Promise<Store> {
  const res = await apiClient.get(`/admin/stores/${id}`);
  return res.data;
}

export default {
  createStore,
  updateStore,
  getStores,
  getStore,
};
