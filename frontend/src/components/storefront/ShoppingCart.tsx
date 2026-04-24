import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { CartItem } from '../../hooks/useCartPersist';

const CLP_FORMATTER = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

function formatClp(value: number): string {
  return CLP_FORMATTER.format(Math.max(0, value || 0));
}

interface ShoppingCartProps {
  open: boolean;
  onToggle: () => void;
  items: CartItem[];
  itemCount: number;
  total: number;
  updateQty: (id: string, qty: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
}

function ShoppingCart({
  open,
  onToggle,
  items,
  itemCount,
  total,
  updateQty,
  removeItem,
  clearCart,
}: ShoppingCartProps) {
  return (
    <aside className={`sf-cart ${open ? 'open' : ''}`}>
      <button type="button" className="sf-cart-fab" onClick={onToggle}>
        Carrito ({itemCount})
      </button>

      {open && (
        <div className="sf-cart-panel">
          <div className="sf-cart-header">
            <h3>Tu carrito</h3>
            <button type="button" className="sf-ghost-btn" onClick={clearCart}>
              Vaciar
            </button>
          </div>

          <div className="sf-cart-list">
            {items.length === 0 && <p className="sf-muted">Aun no agregas cartas.</p>}
            {items.map((item) => (
              <div key={item.id} className="sf-cart-row">
                <img src={item.imageUrl} alt={item.name} />
                <div>
                  <strong>{item.name}</strong>
                  <p>{formatClp(item.price)}</p>
                </div>
                <input
                  type="number"
                  min={1}
                  max={item.stock}
                  value={item.quantity}
                  onChange={(e) => updateQty(item.id, Number(e.target.value || 1))}
                />
                <button type="button" className="sf-link-btn" onClick={() => removeItem(item.id)}>
                  Quitar
                </button>
              </div>
            ))}
          </div>

          <div className="sf-cart-footer">
            <div>
              <span>Total</span>
              <strong>{formatClp(total)}</strong>
            </div>
            <Link to="/storefront/checkout" className="sf-primary-btn">
              Ir a checkout
            </Link>
          </div>
        </div>
      )}
    </aside>
  );
}

export default memo(ShoppingCart);
