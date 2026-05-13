import { useParams, Link } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync';
import { getOrder } from '../services/erp';
import apiClient from '../services/api';
import StorefrontLayout from '../components/storefront/StorefrontLayout';
import './storefront_v2.css';

const FULFILLMENT_LABELS: Record<string, { label: string, color: string }> = {
  PENDING_PAYMENT: { label: 'Por Pagar', color: '#ef4444' },
  PAID: { label: 'Pagado', color: '#10b981' },
  READY_FOR_PICKUP: { label: 'Listo para Retiro', color: '#f59e0b' },
  SHIPPED: { label: 'Enviado', color: '#3b82f6' },
  DELIVERED: { label: 'Recibido', color: '#6366f1' },
  CANCELLED: { label: 'Cancelado', color: '#64748b' },
};

function formatClp(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
}

export default function StorefrontOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: order, status } = useAsync(() => getOrder(id!), true, [id]);

  if (status === 'pending') return <StorefrontLayout><div className="loading-spinner">Cargando detalles de tu pedido...</div></StorefrontLayout>;
  if (status === 'error' || !order) return <StorefrontLayout><div className="error-message">No pudimos encontrar este pedido.</div></StorefrontLayout>;

  return (
    <StorefrontLayout>
      <div style={{ marginTop: 40 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
          <div>
            <Link to="/storefront/profile" style={{ color: 'var(--store-primary)', textDecoration: 'none', fontWeight: 600 }}>← Volver a mi cuenta</Link>
            <h1 style={{ fontWeight: 900, marginTop: 10 }}>Pedido #{order.orderNumber}</h1>
          </div>
          <div style={{ 
            padding: '10px 20px', 
            borderRadius: 50, 
            fontWeight: 800, 
            background: FULFILLMENT_LABELS[order.fulfillmentStatus]?.color + '22',
            color: FULFILLMENT_LABELS[order.fulfillmentStatus]?.color 
          }}>
            {FULFILLMENT_LABELS[order.fulfillmentStatus]?.label}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: 40, alignItems: 'start' }}>
          <div className="card" style={{ padding: 30, borderRadius: 20, boxShadow: 'var(--store-shadow)', border: '1px solid var(--store-border)' }}>
            <h3 style={{ marginBottom: 20, fontWeight: 800 }}>Productos en este envío</h3>
            <div style={{ display: 'grid', gap: 20 }}>
              {(order.items || []).map((item: any) => (
                <div key={item.id} style={{ display: 'flex', gap: 20, alignItems: 'center', borderBottom: '1px solid var(--store-border)', paddingBottom: 20 }}>
                  <img src={item.listing?.imageUrl || item.listing?.card?.imageUrl} alt="" style={{ width: 70, height: 100, objectFit: 'contain', background: '#000', borderRadius: 10 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{item.listing?.cardName || item.listing?.card?.cardName}</div>
                    <div style={{ color: 'var(--store-text-muted)', fontSize: '0.9rem' }}>{item.listing?.cardCode || item.listing?.card?.cardCode}</div>
                    <div style={{ marginTop: 5 }}><span className="badge badge-gray">{item.quantity} unidades</span></div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{formatClp(item.pricePerUnit * item.quantity)}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--store-text-muted)' }}>{formatClp(item.pricePerUnit)} c/u</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside style={{ display: 'grid', gap: 30 }}>
            <div className="card" style={{ padding: 25, borderRadius: 20, boxShadow: 'var(--store-shadow)', border: '1px solid var(--store-border)' }}>
              <h3 style={{ marginBottom: 15, fontWeight: 800 }}>Resumen de Pago</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span>Subtotal:</span>
                  <span>{formatClp(order.subtotal)}</span>
                </div>
                {order.discountAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#10b981', fontWeight: 600 }}>
                    <span>Descuento:</span>
                    <span>-{formatClp(order.discountAmount)}</span>
                  </div>
                )}
                <hr style={{ border: 'none', borderTop: '1px solid var(--store-border)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.3rem', fontWeight: 900, color: 'var(--store-primary)' }}>
                  <span>Total:</span>
                  <span>{formatClp(order.total)}</span>
                </div>
                <div style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--store-text-muted)' }}>
                  Método: <strong>{order.paymentMethod}</strong>
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 25, borderRadius: 20, boxShadow: 'var(--store-shadow)', border: '1px solid var(--store-border)' }}>
              <h3 style={{ marginBottom: 15, fontWeight: 800 }}>Envío / Entrega</h3>
              <p style={{ fontSize: '0.9rem', lineHeight: '1.6', color: 'var(--store-text-muted)' }}>
                {order.notes?.includes('Nombre:') ? order.notes.split('. ')[0] : 'Información de despacho procesada.'}
              </p>
              <a 
                href={`${apiClient.defaults.baseURL}/orders/${order.id}/receipt`} 
                target="_blank" 
                rel="noreferrer" 
                className="btn btn-secondary" 
                style={{ width: '100%', marginTop: 15, borderRadius: 10, textAlign: 'center', textDecoration: 'none', display: 'block' }}
              >
                📄 Descargar Recibo
              </a>
            </div>
          </aside>
        </div>
      </div>
    </StorefrontLayout>
  );
}
