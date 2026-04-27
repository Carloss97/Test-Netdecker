import { useState } from 'react';
import { createMercadoPagoPreference } from '../services/erp';

export default function MercadoPagoCheckout({ items, onSuccess, storeId }: { items: { listingId: string; quantity: number }[]; onSuccess?: () => void; storeId?: string | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleMercadoPago() {
    setError(null);
    setLoading(true);
    try {
      const reqItems = items.map((it) => ({ listingId: it.listingId, quantity: it.quantity }));
      const returnUrl = window.location.href; // return to the same checkout page to handle success state

      const resp = await createMercadoPagoPreference({ 
        items: reqItems, 
        storeId, 
        back_urls: { 
          success: returnUrl, 
          failure: returnUrl, 
          pending: returnUrl 
        } 
      });

      const pref = resp?.preference || resp;
      const initPoint = pref?.init_point || pref?.sandbox_init_point || pref?.response?.init_point;

      if (!initPoint) throw new Error('No se pudo obtener el punto de inicio de Mercado Pago');

      // Redirect in the same tab for better reliability
      window.location.href = initPoint;

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
