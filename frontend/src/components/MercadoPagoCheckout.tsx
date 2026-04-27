import { useState } from 'react';
import { createMercadoPagoPreference } from '../services/erp';

export default function MercadoPagoCheckout({ items, onSuccess, storeId }: { items: any[]; onSuccess?: () => void; storeId?: string | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleMercadoPago() {
    setError(null);
    setLoading(true);
    try {
      // Map storefront items to the shape MercadoPago expects
      const reqItems = items.map((it: any) => ({
        id: it.listingId || it.id,
        title: it.name || 'Carta TCG',
        unit_price: Number(it.price || it.finalPrice || 0),
        quantity: Number(it.quantity || it.qty || 1),
      }));

      const returnUrl = window.location.origin + '/storefront'; 
      
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
      const initPoint = pref?.init_point || pref?.sandbox_init_point || (resp as any)?.init_point;
      
      if (!initPoint) throw new Error('No se pudo obtener el link de pago');

      // Immediate redirect
      window.location.href = initPoint;
      
      onSuccess?.();
    } catch (err: any) {
      setError(err?.message || 'Error al conectar con Mercado Pago');
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
