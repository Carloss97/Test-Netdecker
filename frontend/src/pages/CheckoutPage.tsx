import { useMemo, useState, useEffect, type FormEvent, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import useCartPersist from '../hooks/useCartPersist';
import { posCheckout } from '../services/erp';
import apiClient from '../services/api';
import { logClientError } from '../utils/observability';
import StorefrontLayout from '../components/storefront/StorefrontLayout';
import StripeCheckout from '../components/StripeCheckout';
import ModeToggle from '../components/ModeToggle';
import './storefront_v2.css';

const MercadoPagoCheckout = lazy(() => import('../components/MercadoPagoCheckout'));

function formatClp(value: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(Math.max(0, value || 0));
}

export default function CheckoutPage() {
  const cart = useCartPersist();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [usePoints, setUsePoints] = useState(false);
  const [customer, setCustomer] = useState<any>(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    paymentMethod: 'mercadopago', 
    notes: '',
  });

  // Autocomplete if user is logged in
  useEffect(() => {
    const saved = localStorage.getItem('customer_data');
    if (saved) {
      const data = JSON.parse(saved);
      setCustomer(data);
      setForm(prev => ({
        ...prev,
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        address: data.address || '',
      }));
    }
  }, []);

  const discountAmount = appliedCoupon?.discountAmount || 0;
  const pointsDiscount = usePoints ? Math.min(customer?.pointsBalance || 0, cart.total - discountAmount) : 0;
  const finalTotal = Math.max(0, cart.total - discountAmount - pointsDiscount);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setValidatingCoupon(true);
    setFormError(null);
    try {
      const { data } = await apiClient.get('/storefront/coupons/validate', {
        params: { code: couponCode, cartTotal: cart.total }
      });
      setAppliedCoupon(data);
      setCouponCode('');
    } catch (err: any) {
      setFormError(err.response?.data?.error?.message || 'Cupón no válido');
      setAppliedCoupon(null);
    } finally {
      setValidatingCoupon(false);
    }
  };

  const canSubmitFields = useMemo(() => form.name && form.email && form.address, [form]);
  const cartItems = useMemo(() => cart.items.map(it => ({ listingId: it.id, quantity: it.quantity })), [cart.items]);

  const onPaymentSuccess = () => {
    setSubmitted(true);
    cart.clearCart();
  };

  const submitManualOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmitFields || cart.items.length === 0) {
      setFormError('Completa tus datos y añade productos al carrito.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const paymentMethod = form.paymentMethod === 'transfer' ? 'TRANSFER' : 'CASH';

      const order = await posCheckout({
        items: cartItems,
        customerEmail: form.email,
        paymentMethod,
        couponCode: appliedCoupon?.code,
        pointsToRedeem: usePoints ? pointsDiscount : 0,
        notes: `Nombre: ${form.name}, Tel: ${form.phone}, Dir: ${form.address}. ${form.notes}`,
      });

      setSubmitted(true);
      setCreatedOrderId(String((order as any).id || ''));
      cart.clearCart();
    } catch (err) {
      setFormError('No se pudo crear el pedido. Intenta nuevamente.');
      logClientError({ area: 'checkout', action: 'manual-submit', message: 'No se pudo crear el pedido manual', error: err });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <StorefrontLayout>
        <div className="sf-status ok" style={{ padding: '60px', textAlign: 'center', marginTop: 40, background: 'var(--store-surface)', borderRadius: 24, boxShadow: 'var(--store-shadow)' }}>
          <div style={{ fontSize: '4rem', marginBottom: 20 }}>🎉</div>
          <h2 style={{ fontWeight: 900, fontSize: '2rem' }}>¡Pedido Confirmado!</h2>
          <p style={{ color: 'var(--store-text-muted)', marginTop: 10 }}>Hemos recibido tu pedido correctamente. {createdOrderId ? `ID: ${createdOrderId}` : ''}</p>
          <Link className="btn btn-primary" style={{ marginTop: 30, padding: '12px 40px', background: 'var(--store-primary)', border: 'none', borderRadius: 50 }} to="/storefront">Volver a la tienda</Link>
        </div>
      </StorefrontLayout>
    );
  }

  return (
    <StorefrontLayout>
      <div style={{ marginTop: 40 }}>
        <h1 style={{ fontWeight: 900, marginBottom: 40 }}>Finalizar Compra</h1>

        {formError && <div className="sf-status warn" style={{ marginBottom: 20, padding: '15px', borderRadius: 12 }}>{formError}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 40, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 30 }}>
            <section className="card" style={{ padding: 30, borderRadius: 20, boxShadow: 'var(--store-shadow)', border: '1px solid var(--store-border)' }}>
              <h3 style={{ marginBottom: 20, fontWeight: 800 }}>Tus Productos</h3>
              <div style={{ display: 'grid', gap: 15 }}>
                {cart.items.map((item) => (
                  <div key={item.id} style={{ display: 'flex', gap: 15, alignItems: 'center', borderBottom: '1px solid var(--store-border)', paddingBottom: 15 }}>
                    <img src={item.imageUrl} alt={item.name} style={{ width: 60, height: 80, objectFit: 'contain', background: '#000', borderRadius: 8 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{item.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--store-border)', borderRadius: 6, overflow: 'hidden' }}>
                          <button 
                            className="btn btn-ghost" 
                            style={{ padding: '2px 10px', border: 'none', background: 'none' }}
                            onClick={() => cart.updateQty(item.id, item.quantity - 1)}
                          >-</button>
                          <span style={{ padding: '0 10px', fontSize: '0.85rem', fontWeight: 600 }}>{item.quantity}</span>
                          <button 
                            className="btn btn-ghost" 
                            style={{ padding: '2px 10px', border: 'none', background: 'none' }}
                            onClick={() => cart.updateQty(item.id, item.quantity + 1)}
                          >+</button>
                        </div>
                        <button 
                          className="btn btn-link" 
                          style={{ color: '#ef4444', fontSize: '0.75rem', padding: 0, border: 'none', background: 'none', textDecoration: 'underline', cursor: 'pointer' }}
                          onClick={() => cart.removeItem(item.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                    <div style={{ fontWeight: 700 }}>{formatClp(item.price * item.quantity)}</div>
                  </div>
                ))}
              </div>
            </section>

            {customer && customer.pointsBalance > 0 && (
              <section className="card" style={{ padding: 30, borderRadius: 20, boxShadow: 'var(--store-shadow)', border: '1px solid var(--store-border)' }}>
                <h3 style={{ marginBottom: 10, fontWeight: 800 }}>✨ Canjear NetPoints</h3>
                <p style={{ color: 'var(--store-text-muted)', fontSize: '0.85rem', marginBottom: 15 }}>
                  Tienes <strong>{customer.pointsBalance.toLocaleString('es-CL')} NP</strong> disponibles.
                  Cada punto equivale a $1 CLP de descuento.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <ModeToggle 
                    checked={usePoints}
                    onToggle={() => setUsePoints(!usePoints)}
                    onLabel="Usar puntos"
                    offLabel="No usar"
                  />
                  {usePoints && (
                    <div style={{ color: 'var(--store-primary)', fontWeight: 700 }}>
                      -{formatClp(pointsDiscount)} aplicados
                    </div>
                  )}
                </div>
              </section>
            )}

            <section className="card" style={{ padding: 30, borderRadius: 20, boxShadow: 'var(--store-shadow)', border: '1px solid var(--store-border)' }}>
              <h3 style={{ marginBottom: 20, fontWeight: 800 }}>Cupón de Descuento</h3>
              <div style={{ display: 'flex', gap: 10 }}>
                <input 
                  className="input" 
                  placeholder="Código del cupón" 
                  value={couponCode}
                  onChange={e => setCouponCode(e.target.value.toUpperCase())}
                  disabled={!!appliedCoupon}
                  style={{ borderRadius: 8 }}
                />
                {appliedCoupon ? (
                  <button className="btn btn-secondary" onClick={() => setAppliedCoupon(null)}>Quitar</button>
                ) : (
                  <button className="btn btn-primary" onClick={handleApplyCoupon} disabled={validatingCoupon || !couponCode} style={{ background: 'var(--store-primary)', border: 'none', borderRadius: 8, padding: '0 20px' }}>
                    {validatingCoupon ? '...' : 'Aplicar'}
                  </button>
                )}
              </div>
              {appliedCoupon && (
                <div style={{ marginTop: 10, color: '#10b981', fontWeight: 600, fontSize: '0.9rem' }}>
                  ✓ Cupón "{appliedCoupon.code}" aplicado: -{formatClp(appliedCoupon.discountAmount)}
                </div>
              )}
            </section>
          </div>

          <aside style={{ display: 'grid', gap: 30 }}>
            <section className="card" style={{ padding: 30, borderRadius: 20, boxShadow: 'var(--store-shadow)', border: '1px solid var(--store-border)' }}>
              <h3 style={{ marginBottom: 20, fontWeight: 800 }}>Datos de Envío</h3>
              <div style={{ display: 'grid', gap: 15 }}>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre completo" required style={{ borderRadius: 8 }} />
                <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Correo electrónico" required style={{ borderRadius: 8 }} />
                <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Teléfono" style={{ borderRadius: 8 }} />
                <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Dirección de entrega" required style={{ borderRadius: 8 }} />
              </div>
            </section>

            <section className="card" style={{ padding: 30, borderRadius: 20, background: 'var(--store-surface)', boxShadow: 'var(--store-shadow)', border: '1px solid var(--store-border)' }}>
              <h3 style={{ marginBottom: 20, fontWeight: 800 }}>Resumen y Pago</h3>
              <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--store-text-muted)' }}>Subtotal</span>
                  <span>{formatClp(cart.total)}</span>
                </div>
                {appliedCoupon && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981', fontWeight: 600 }}>
                    <span>Descuento ({appliedCoupon.code})</span>
                    <span>-{formatClp(appliedCoupon.discountAmount)}</span>
                  </div>
                )}
                <hr style={{ border: 'none', borderTop: '1px solid var(--store-border)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.4rem', fontWeight: 900, color: 'var(--store-primary)' }}>
                  <span>Total</span>
                  <span>{formatClp(finalTotal)}</span>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 15 }}>
                <select 
                  className="input" 
                  value={form.paymentMethod} 
                  onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                  style={{ fontWeight: 600, borderRadius: 8 }}
                >
                  <option value="mercadopago">Mercado Pago (Crédito/Débito)</option>
                  <option value="stripe">Stripe (Internacional)</option>
                  <option value="transfer">Transferencia Bancaria</option>
                  <option value="cash">Pagar en Tienda</option>
                </select>

                <div style={{ marginTop: 10 }}>
                  {form.paymentMethod === 'mercadopago' && (
                    <Suspense fallback={<p>Cargando Mercado Pago...</p>}>
                      <MercadoPagoCheckout items={cartItems} onSuccess={onPaymentSuccess} storeId={null} />
                    </Suspense>
                  )}

                  {form.paymentMethod === 'stripe' && (
                    <StripeCheckout items={cartItems} onSuccess={onPaymentSuccess} storeId={null} />
                  )}

                  {(form.paymentMethod === 'cash' || form.paymentMethod === 'transfer') && (
                    <button 
                      className="btn btn-primary" 
                      style={{ width: '100%', padding: '15px', background: 'var(--store-primary)', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: '1rem', cursor: 'pointer' }} 
                      onClick={submitManualOrder} 
                      disabled={!canSubmitFields || submitting}
                    >
                      {submitting ? 'Procesando...' : 'Confirmar Pedido'}
                    </button>
                  )}
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </StorefrontLayout>
  );
}
