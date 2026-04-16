import apiClient from './api';

export type ThresholdInput = {
  tcg?: string | null;
  editionId?: string | null;
  thresholdPercent: number;
};

export async function getThresholds(params?: Record<string, unknown>) {
  const resp = await apiClient.get('/admin/pricing/thresholds', { params });
  return resp.data;
}

export async function createThreshold(payload: ThresholdInput) {
  const resp = await apiClient.post('/admin/pricing/thresholds', payload);
  return resp.data;
}

export async function updateThreshold(id: string, payload: Partial<ThresholdInput>) {
  const resp = await apiClient.patch(`/admin/pricing/thresholds/${id}`, payload);
  return resp.data;
}

export async function deleteThreshold(id: string) {
  const resp = await apiClient.delete(`/admin/pricing/thresholds/${id}`);
  return resp.data;
}

export default { getThresholds, createThreshold, updateThreshold, deleteThreshold };
