import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import useCartPersist from '../hooks/useCartPersist';
import { posCheckout } from '../services/erp';
import { logClientError } from '../utils/observability';
import './storefront.css';

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
    paymentMethod: 'cash',
    notes: '',
  });

  const canSubmit = useMemo(() => cart.items.length > 0 && form.name && form.email && form.address, [cart.items.length, form]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      setFormError('Completa nombre, email y direccion para continuar.');
      return;
    }

    const invalidDemoItems = cart.items.filter((item) => String(item.id).startsWith('demo-'));
    if (invalidDemoItems.length > 0) {
      setFormError('Algunos items del carrito son de demo y no se pueden procesar en inventario real.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const paymentMethod =
        form.paymentMethod === 'card'
          ? 'CARD'
          : form.paymentMethod === 'transfer'
            ? 'TRANSFER'
            : 'CASH';

      const order = await posCheckout({
        items: cart.items.map((item) => ({ listingId: item.id, quantity: item.quantity })),
        customerEmail: form.email,
        paymentMethod,
      });

      setSubmitted(true);
      setCreatedOrderId(String((order as { id?: string }).id || ''));
      cart.clearCart();
    } catch (err) {
      setFormError('No se pudo crear el pedido. Revisa stock y vuelve a intentar.');
      logClientError({
        area: 'storefront-checkout-page',
        action: 'submit-checkout',
        message: 'Storefront checkout failed',
        context: {
          cartSize: cart.items.length,
          total: cart.total,
          paymentMethod: form.paymentMethod,
        },
        error: err,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="storefront-page">
      <form className="sf-checkout-shell" onSubmit={submit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1>Checkout demo</h1>
          <Link className="sf-ghost-btn" to="/storefront">Volver al catalogo</Link>
        </div>

        {submitted && (
          <div className="sf-status ok">
            Pedido creado correctamente en el backend.
            {createdOrderId ? ` ID: ${createdOrderId}` : ''}.
          </div>
        )}

        {formError && <div className="sf-status warn">{formError}</div>}

        <div className="sf-checkout-grid">
          <section className="sf-summary-card">
            <h3>Resumen de pedido</h3>
            <ul>
              {cart.items.length === 0 && <li className="sf-muted">Tu carrito esta vacio.</li>}
              {cart.items.map((item) => (
                <li key={item.id}>
                  <span>{item.name} x{item.quantity}</span>
                  <strong>{formatClp(item.price * item.quantity)}</strong>
                </li>
              ))}
            </ul>
            <hr style={{ margin: '12px 0', borderColor: 'var(--sf-border)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Total</span>
              <strong>{formatClp(cart.total)}</strong>
            </div>
          </section>

          <section className="sf-summary-card" style={{ display: 'grid', gap: 8 }}>
            <h3>Datos del cliente</h3>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre completo" />
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="correo@ejemplo.com" />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Telefono" />
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Direccion de entrega" />
            <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
              <option value="card">Tarjeta en tienda</option>
            </select>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} placeholder="Notas adicionales" />
            <button className="sf-primary-btn" type="submit" disabled={!canSubmit || submitting}>
              {submitting ? 'Procesando pedido...' : 'Confirmar pedido'}
            </button>
          </section>
        </div>
      </form>
    </div>
  );
}
