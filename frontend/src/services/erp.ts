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

export async function posCheckout(params: {
  items: { listingId: string; quantity: number }[];
  customerEmail?: string | null;
  paymentMethod?: string | null;
  externalReference?: string | null;
}) {
  const { data } = await apiClient.post('/payments/pos-sale', params);
  return data.order ?? data;
}
// Note: `params` may include optional `storeId?: string | null` to scope the sale to a store.

export async function createStripePaymentIntent(params: {
  items: { listingId: string; quantity: number }[];
  storeId?: string | null;
  customerEmail?: string | null;
}) {
  const { data } = await apiClient.post('/payments/stripe/create-intent', params);
  return data;
}

export async function createMercadoPagoPreference(params: {
  items: { listingId: string; quantity: number; title?: string; unit_price?: number }[];
  storeId?: string | null;
  back_urls?: Record<string,string> | null;
}) {
  const { data } = await apiClient.post('/payments/mercadopago/create-preference', params);
  return data;
}

export default {
  createReservation,
  commitReservation,
  releaseReservation,
  transferStock,
  createAndCommitReservation,
  posCheckout,
  createStripePaymentIntent,
  createMercadoPagoPreference,
};
