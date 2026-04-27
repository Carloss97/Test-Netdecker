import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync';
import { getOrder, updateFulfillmentStatus, cancelOrder } from '../services/erp';

const FULFILLMENT_STATUSES = [
  { value: 'PENDING_PAYMENT', label: 'Por Pagar', color: '#ef4444' },
  { value: 'PAID', label: 'Pagado', color: '#10b981' },
  { value: 'READY_FOR_PICKUP', label: 'Listo para Retiro', color: '#f59e0b' },
  { value: 'SHIPPED', label: 'Enviado', color: '#3b82f6' },
  { value: 'DELIVERED', label: 'Recibido', color: '#6366f1' },
  { value: 'CANCELLED', label: 'Cancelado', color: '#64748b' },
];

function formatClp(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [updating, setUpdating] = useState(false);

  const { data: order, status, error, execute: reload } = useAsync(() => getOrder(id!), [id]);

  const handleStatusChange = async (newStatus: string) => {
    if (!id) return;
    setUpdating(true);
    try {
      await updateFulfillmentStatus(id, newStatus);
      void reload();
    } catch (err) {
      alert('Error al actualizar el estado');
    } finally {
      setUpdating(false);
    }
  };

  const handleCancel = async () => {
    if (!id || !confirm('¿Seguro que deseas cancelar esta orden?')) return;
    setUpdating(true);
    try {
      await cancelOrder(id);
      void reload();
    } catch (err) {
      alert('Error al cancelar la orden');
    } finally {
      setUpdating(false);
    }
  };

  if (status === 'pending') return <div className="loading-spinner">Cargando detalles del pedido...</div>;
  if (status === 'error') return <div className="error-message">Error: {error?.message}</div>;
  if (!order) return <div className="empty-state">No se encontró el pedido.</div>;

  return (
    <div className="order-detail-page">
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/pedidos" className="btn btn-secondary btn-sm">← Volver a Pedidos</Link>
        <div style={{ display: 'flex', gap: 10 }}>
          {order.fulfillmentStatus !== 'CANCELLED' && (
            <button className="btn btn-danger btn-sm" onClick={handleCancel} disabled={updating}>
              Cancelar Orden
            </button>
          )}
          <a 
            href={`/api/orders/${order.id}/receipt`} 
            target="_blank" 
            rel="noreferrer"
            className="btn btn-primary btn-sm"
          >
            🖨️ Imprimir Recibo
          </a>
        </div>
      </div>

      <div className="grid-cols-2" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
        <div className="card">
          <div className="section-title">Ítems del Pedido</div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Imagen</th>
                  <th>Carta</th>
                  <th>Cantidad</th>
                  <th>Precio Un.</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {(order.items || []).map((item: any) => (
                  <tr key={item.id}>
                    <td style={{ width: 60 }}>
                      <img 
                        src={item.listing?.card?.imageUrl} 
                        alt="" 
                        style={{ width: 50, height: 70, objectFit: 'contain', background: '#000', borderRadius: 4 }} 
                      />
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.listing?.card?.cardName || 'Producto'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {item.listing?.card?.cardCode} · {item.listing?.card?.rarity}
                      </div>
                    </td>
                    <td><span className="badge badge-gray">{item.quantity} uds</span></td>
                    <td>{formatClp(item.price)}</td>
                    <td style={{ fontWeight: 700 }}>{formatClp(item.price * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ textAlign: 'right', fontWeight: 600 }}>Total:</td>
                  <td style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--primary)' }}>{formatClp(order.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="card">
            <div className="section-title">Estado del Pedido</div>
            <div style={{ marginBottom: 15 }}>
              <select
                className="input"
                value={order.fulfillmentStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={updating || order.fulfillmentStatus === 'CANCELLED'}
                style={{ 
                  backgroundColor: FULFILLMENT_STATUSES.find(s => s.value === order.fulfillmentStatus)?.color + '22',
                  borderColor: FULFILLMENT_STATUSES.find(s => s.value === order.fulfillmentStatus)?.color,
                  fontWeight: 600,
                  fontSize: '1rem'
                }}
              >
                {FULFILLMENT_STATUSES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="sf-muted" style={{ fontSize: '0.85rem' }}>
              El cambio de estado permite hacer seguimiento al despacho o retiro.
            </div>
          </div>

          <div className="card">
            <div className="section-title">Información del Cliente</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div>
                <label className="sf-muted" style={{ fontSize: '0.75rem' }}>Email</label>
                <div style={{ fontWeight: 500 }}>{order.customerEmail}</div>
              </div>
              <div>
                <label className="sf-muted" style={{ fontSize: '0.75rem' }}>Nº Orden</label>
                <div style={{ fontWeight: 500 }}>{order.orderNumber}</div>
              </div>
              <div>
                <label className="sf-muted" style={{ fontSize: '0.75rem' }}>Fecha</label>
                <div style={{ fontWeight: 500 }}>{new Date(order.createdAt).toLocaleString('es-CL')}</div>
              </div>
              <div>
                <label className="sf-muted" style={{ fontSize: '0.75rem' }}>Método de Pago</label>
                <div><span className="badge badge-blue">{order.paymentMethod}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
