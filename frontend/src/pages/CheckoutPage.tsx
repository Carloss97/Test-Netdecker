import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import useCartPersist from '../hooks/useCartPersist';
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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      setFormError('Completa nombre, email y direccion para continuar.');
      return;
    }
    setFormError(null);
    setSubmitted(true);
    cart.clearCart();
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
            Pedido simulado generado correctamente. No se realizo ningun cobro real.
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
            <button className="sf-primary-btn" type="submit" disabled={!canSubmit}>
              Confirmar pedido (mock)
            </button>
          </section>
        </div>
      </form>
    </div>
  );
}
