import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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

export default function ProfilePage() {
  const [customer, setCustomer] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('customer_token');
    if (!token) {
      navigate('/storefront/login?next=/storefront/profile');
      return;
    }

    const loadData = async () => {
      try {
        const [meResp, ordersResp] = await Promise.all([
          apiClient.get('/storefront/auth/me'),
          apiClient.get('/storefront/auth/orders')
        ]);
        setCustomer(meResp.data.customer);
        setOrders(ordersResp.data.orders);
      } catch (err) {
        console.error('Failed to load profile data', err);
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [navigate]);

  if (loading) return <StorefrontLayout><div className="loading-spinner">Cargando tu perfil...</div></StorefrontLayout>;

  return (
    <StorefrontLayout>
      <div style={{ marginTop: 40 }}>
        <h1 style={{ fontWeight: 900, marginBottom: 10 }}>Mi Cuenta</h1>
        <p style={{ color: 'var(--store-text-muted)', marginBottom: 40 }}>Gestiona tus datos y haz seguimiento a tus pedidos.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 40 }}>
          <aside>
            <div className="card" style={{ padding: 25, borderRadius: 20 }}>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ width: 80, height: 80, background: 'var(--store-primary)', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 15px' }}>
                  {customer?.name?.charAt(0)}
                </div>
                <h3 style={{ margin: 0 }}>{customer?.name}</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--store-text-muted)' }}>{customer?.email}</p>
              </div>
              <hr style={{ border: 'none', borderTop: '1px solid var(--store-border)', margin: '20px 0' }} />
              <div style={{ display: 'grid', gap: 15 }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--store-text-muted)' }}>Teléfono</label>
                  <div style={{ fontWeight: 500 }}>{customer?.phone || 'No registrado'}</div>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--store-text-muted)' }}>Dirección</label>
                  <div style={{ fontWeight: 500 }}>{customer?.address || 'No registrado'}</div>
                </div>
              </div>
            </div>
          </aside>

          <section>
            <div className="card" style={{ padding: 25, borderRadius: 20 }}>
              <h3 style={{ marginBottom: 20 }}>Historial de Pedidos</h3>
              
              {orders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <p style={{ color: 'var(--store-text-muted)' }}>Aún no has realizado pedidos.</p>
                  <Link to="/storefront" className="btn btn-primary" style={{ marginTop: 15, background: 'var(--store-primary)', border: 'none' }}>Empezar a comprar</Link>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Nº Orden</th>
                        <th>Fecha</th>
                        <th>Total</th>
                        <th>Estado</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(order => (
                        <tr key={order.id}>
                          <td style={{ fontWeight: 700 }}>{order.orderNumber}</td>
                          <td style={{ fontSize: '0.85rem' }}>{new Date(order.createdAt).toLocaleDateString('es-CL')}</td>
                          <td style={{ fontWeight: 600 }}>{new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(order.total)}</td>
                          <td>
                            <span style={{ 
                              padding: '4px 12px', 
                              borderRadius: 50, 
                              fontSize: '0.75rem', 
                              fontWeight: 700, 
                              background: FULFILLMENT_LABELS[order.fulfillmentStatus]?.color + '22',
                              color: FULFILLMENT_LABELS[order.fulfillmentStatus]?.color
                            }}>
                              {FULFILLMENT_LABELS[order.fulfillmentStatus]?.label}
                            </span>
                          </td>
                          <td>
                            <Link to={`/storefront/orders/${order.id}`} className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem' }}>Ver Detalle</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </StorefrontLayout>
  );
}
