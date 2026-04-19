import apiClient from './api';

export async function login(email: string, password: string, storeId?: string) {
  const { data } = await apiClient.post('/admin/auth/login', { email, password, storeId });
  return data;
}

export default { login };
