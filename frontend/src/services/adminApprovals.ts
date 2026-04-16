import apiClient from './api';

export async function listPendingApprovals(limit = 50) {
  try {
    const resp = await apiClient.get('/admin/approvals/pending', { params: { limit } });
    return resp.data;
  } catch (_) {
    return { success: true, approvals: [] } as any;
  }
}

export async function approveApproval(id: string) {
  const resp = await apiClient.post(`/admin/approvals/${id}/approve`);
  return resp.data;
}

export async function rejectApproval(id: string, reason?: string) {
  const resp = await apiClient.post(`/admin/approvals/${id}/reject`, { reason });
  return resp.data;
}

export default { listPendingApprovals, approveApproval, rejectApproval };
