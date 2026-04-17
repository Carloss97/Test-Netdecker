import { useState } from 'react';
import { createMercadoPagoPreference } from '../services/erp';

export default function MercadoPagoCheckout({ items, onSuccess, storeId }: { items: { listingId: string; quantity: number }[]; onSuccess?: () => void; storeId?: string | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleMercadoPago() {
    setError(null);
    setLoading(true);
    try {
      // Build request items: include optional title/unit_price if available
      const reqItems = items.map((it) => ({ listingId: it.listingId, quantity: it.quantity }));
      const returnUrl = `${window.location.origin}/tienda/pos`; // landing return
      const resp = await createMercadoPagoPreference({ items: reqItems, storeId, back_urls: { success: returnUrl, failure: returnUrl, pending: returnUrl } });
      const pref = resp?.preference || resp?.preference || resp;
      const initPoint = pref?.init_point || pref?.sandbox_init_point || pref?.response?.init_point || pref?.response?.sandbox_init_point;
      if (!initPoint) throw new Error('No init_point returned from Mercado Pago');

      // Open checkout in new tab/window
      window.open(initPoint, '_blank');

      // Optionally notify backend as pending (we rely on webhook to finalize). Do not create order here to avoid duplicates.
      onSuccess?.();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <button onClick={handleMercadoPago} disabled={loading}>{loading ? 'Redirigiendo…' : 'Pagar con Mercado Pago'}</button>
    </div>
  );
}
