import { useMemo, useState, type FormEvent, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import useCartPersist from '../hooks/useCartPersist';
import { posCheckout } from '../services/erp';
import { logClientError } from '../utils/observability';
import './storefront.css';
import StripeCheckout from '../components/StripeCheckout';

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
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    paymentMethod: 'mercadopago', // default to digital
    notes: '',
  });

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
        notes: `Nombre: ${form.name}, Tel: ${form.phone}, Dir: ${form.address}. ${form.notes}`,
      });

      setSubmitted(true);
      setCreatedOrderId(String((order as any).id || ''));
      cart.clearCart();
    } catch (err) {
      setFormError('No se pudo crear el pedido. Intenta nuevamente.');
      logClientError({ area: 'checkout', action: 'manual-submit', error: err });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="storefront-page sf-container">
        <div className="sf-status ok" style={{ padding: '40px', textAlign: 'center' }}>
          <h2>¡Pedido Confirmado!</h2>
          <p>Hemos recibido tu pedido correctamente. {createdOrderId ? `ID: ${createdOrderId}` : ''}</p>
          <Link className="sf-primary-btn" style={{ marginTop: '20px' }} to="/storefront">Volver a la tienda</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="storefront-page">
      <div className="sf-checkout-shell">
        <div className="sf-topbar">
          <h1>Finalizar Compra</h1>
          <Link className="sf-ghost-btn" to="/storefront">Seguir comprando</Link>
        </div>

        {formError && <div className="sf-status warn">{formError}</div>}

        <div className="sf-checkout-grid">
          <section className="sf-summary-card">
            <h3>Tus Productos</h3>
            <div className="sf-cart-list" style={{ border: 'none', padding: 0 }}>
              {cart.items.map((item) => (
                <div key={item.id} className="sf-cart-row" style={{ gridTemplateColumns: '48px 1fr auto' }}>
                  <img src={item.imageUrl} alt={item.name} style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>{item.name}</div>
                    <div className="sf-muted" style={{ fontSize: '12px' }}>x{item.quantity}</div>
                  </div>
                  <strong>{formatClp(item.price * item.quantity)}</strong>
                </div>
              ))}
            </div>
            <hr style={{ margin: '16px 0', borderColor: 'var(--sf-border)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', fontWeight: 'bold' }}>
              <span>Total</span>
              <span>{formatClp(cart.total)}</span>
            </div>
          </section>

          <section className="sf-summary-card" style={{ display: 'grid', gap: 12 }}>
            <h3>Datos de Envío</h3>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre completo" />
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Correo electrónico" />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Teléfono" />
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Dirección de entrega" />
            
            <h3 style={{ marginTop: '12px' }}>Método de Pago</h3>
            <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
              <option value="mercadopago">Mercado Pago (Crédito/Débito)</option>
              <option value="stripe">Stripe (Internacional)</option>
              <option value="transfer">Transferencia Bancaria</option>
              <option value="cash">Pagar en Tienda</option>
            </select>

            <div style={{ marginTop: '16px' }}>
              {form.paymentMethod === 'mercadopago' && (
                <Suspense fallback={<p>Cargando Mercado Pago...</p>}>
                  <MercadoPagoCheckout items={cartItems} onSuccess={onPaymentSuccess} storeId={null} />
                </Suspense>
              )}

              {form.paymentMethod === 'stripe' && (
                <StripeCheckout items={cartItems} onSuccess={onPaymentSuccess} storeId={null} />
              )}

              {(form.paymentMethod === 'cash' || form.paymentMethod === 'transfer') && (
                <button className="sf-primary-btn" style={{ width: '100%' }} onClick={submitManualOrder} disabled={!canSubmitFields || submitting}>
                  {submitting ? 'Procesando...' : 'Confirmar Pedido'}
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
