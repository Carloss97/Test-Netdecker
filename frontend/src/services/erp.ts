import apiClient from './api';

export async function createReservation(params: {
  listingId: string;
  quantity: number;
  warehouseId?: string | null;
  reservedBy?: string | null;
  expiresAt?: string | null;
}) {
  const { data } = await apiClient.post('/erp/reservation', params);
  return data.reservation ?? data;
}

export async function commitReservation(id: string) {
  const { data } = await apiClient.post(`/erp/reservation/${id}/commit`);
  return data.reservation ?? data;
}

export async function releaseReservation(id: string) {
  const { data } = await apiClient.post(`/erp/reservation/${id}/release`);
  return data.reservation ?? data;
}

export async function transferStock(params: {
  listingId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  performedBy?: string;
  reference?: string;
  notes?: string;
}) {
  const { data } = await apiClient.post('/erp/stock/transfer', params);
  return data.movement ?? data;
}

export async function createAndCommitReservation(listingId: string, quantity: number, warehouseId?: string | null) {
  const reservation = await createReservation({ listingId, quantity, warehouseId });
  const committed = await commitReservation(reservation.id);
  return committed;
}

export default {
  createReservation,
  commitReservation,
  releaseReservation,
  transferStock,
  createAndCommitReservation,
};
