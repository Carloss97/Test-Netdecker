import apiClient from './api';

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export async function getAccounts(storeId?: string) {
  try {
    const { data } = await apiClient.get('/admin/accounts', { params: storeId ? { storeId } : undefined });
    return data.accounts ?? data;
  } catch (_) {
    return [] as any;
  }
}

export async function createAccount(params: { storeId?: string; code: string; name: string; type: AccountType; description?: string }) {
  const { data } = await apiClient.post('/admin/accounts', params);
  return data.account ?? data;
}

export async function updateAccount(id: string, params: { storeId?: string; code?: string; name?: string; type?: AccountType; description?: string }) {
  const { data } = await apiClient.patch(`/admin/accounts/${id}`, params);
  return data.account ?? data;
}

export async function deleteAccount(id: string) {
  const { data } = await apiClient.delete(`/admin/accounts/${id}`);
  return data;
}

export default { getAccounts, createAccount, updateAccount, deleteAccount };
