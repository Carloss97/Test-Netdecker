import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync';
import { listOrders, updateFulfillmentStatus, cancelOrder } from '../services/erp';

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

export function OrdersPage() {
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const { data, status, execute: reload } = useAsync(() => listOrders({
    fulfillmentStatus: filterStatus || undefined,
    take: 50
  }));

  const orders = data?.orders || [];

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    setUpdatingId(orderId);
    try {
      await updateFulfillmentStatus(orderId, newStatus);
      void reload();
    } catch (err) {
      alert('Error al actualizar el estado');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCancel = async (orderId: string) => {
    if (!confirm('¿Seguro que deseas cancelar esta orden? Se restaurará el stock.')) return;
    setUpdatingId(orderId);
    try {
      await cancelOrder(orderId);
      void reload();
    } catch (err) {
      alert('Error al cancelar la orden');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="orders-page">
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span>Filtrar por estado:</span>
          <select 
            className="input input-sm" 
            value={filterStatus} 
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ minWidth: 200 }}
          >
            <option value="">Todos los pedidos</option>
            {FULFILLMENT_STATUSES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={() => void reload()}>Refrescar</button>
        </div>
      </div>

      {status === 'pending' ? (
        <div className="loading-spinner">Cargando pedidos...</div>
      ) : orders.length === 0 ? (
        <div className="empty-state">No se encontraron pedidos.</div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nº Orden</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Método</th>
                <th>Total</th>
                <th>Estado Logístico</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order: any) => (
                <tr key={order.id} style={{ opacity: updatingId === order.id ? 0.6 : 1 }}>
                  <td style={{ fontWeight: 700 }}>
                    <Link to={`/pedidos/${order.id}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>{new Date(order.createdAt).toLocaleDateString('es-CL')}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{order.customerEmail}</div>
                  </td>
                  <td>
                    <span className="badge badge-gray" style={{ fontSize: '0.7rem' }}>{order.paymentMethod}</span>
                  </td>
                  <td style={{ fontWeight: 700 }}>{formatClp(order.total)}</td>
                  <td>
                    <select
                      className="input input-sm"
                      value={order.fulfillmentStatus}
                      onChange={(e) => handleStatusChange(order.id, e.target.value)}
                      disabled={updatingId === order.id || order.fulfillmentStatus === 'CANCELLED'}
                      style={{ 
                        backgroundColor: FULFILLMENT_STATUSES.find(s => s.value === order.fulfillmentStatus)?.color + '22',
                        borderColor: FULFILLMENT_STATUSES.find(s => s.value === order.fulfillmentStatus)?.color,
                        fontWeight: 600
                      }}
                    >
                      {FULFILLMENT_STATUSES.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Link to={`/pedidos/${order.id}`} className="btn btn-secondary btn-sm">Ver</Link>
                      {order.fulfillmentStatus !== 'CANCELLED' && (
                        <button 
                          className="btn btn-danger btn-sm" 
                          onClick={() => handleCancel(order.id)}
                          disabled={updatingId === order.id}
                        >
                          Anular
                        </button>
                      )}
                      <a 
                        href={`${apiClient.defaults.baseURL}/orders/${order.id}/receipt`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                      >
                        Recibo
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
