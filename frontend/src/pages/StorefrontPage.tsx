import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import useStorefront, { type StorefrontProduct } from '../hooks/useStorefront';
import useCartPersist from '../hooks/useCartPersist';
import FilterSidebar from '../components/storefront/FilterSidebar';
import ProductGrid from '../components/storefront/ProductGrid';
import ShoppingCart from '../components/storefront/ShoppingCart';
import PriceDisplay from '../components/storefront/PriceDisplay';
import RarityBadge from '../components/storefront/RarityBadge';
import './storefront.css';

function useThemeMode() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('storefront_theme');
      return saved === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const updateTheme = (next: 'light' | 'dark') => {
    setTheme(next);
    try {
      localStorage.setItem('storefront_theme', next);
      document.documentElement.setAttribute('data-theme', next);
    } catch {
      // ignore theme persistence issues
    }
  };

  return { theme, updateTheme };
}

export default function StorefrontPage() {
  const { status, error, filteredProducts, filters, setFilters, suggestions, tcgOptions, rarityOptions } = useStorefront();
  const cart = useCartPersist();
  const [selected, setSelected] = useState<StorefrontProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const { theme, updateTheme } = useThemeMode();

  const [activeStore, setActiveStore] = useState(() => {
    try {
      return localStorage.getItem('auth_store') || 'sin tienda activa';
    } catch {
      return 'sin tienda activa';
    }
  });

  useEffect(() => {
    const refreshStore = () => {
      try {
        setActiveStore(localStorage.getItem('auth_store') || 'sin tienda activa');
      } catch {
        setActiveStore('sin tienda activa');
      }
    };

    window.addEventListener('storage', refreshStore);
    window.addEventListener('netdecker:store-changed', refreshStore as EventListener);
    return () => {
      window.removeEventListener('storage', refreshStore);
      window.removeEventListener('netdecker:store-changed', refreshStore as EventListener);
    };
  }, []);

  return (
    <div className="storefront-page">
      <div className="sf-container">
        <div className="sf-topbar">
          <div>
            <strong>Storefront Demo</strong>
            <div className="sf-muted">Tienda activa: {activeStore}</div>
          </div>
          <div>
            <button className="sf-ghost-btn" onClick={() => updateTheme(theme === 'light' ? 'dark' : 'light')}>
              {theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
            </button>
            <Link to="/" className="sf-primary-btn">Volver al ERP</Link>
          </div>
        </div>

        <section className="sf-hero">
          <h1>Cartas reales, vitrina moderna y checkout de demostracion</h1>
          <p>
            Inspirada en tiendas TCG de produccion: busqueda rapida, filtros por juego/rareza, modal de detalle y carrito persistente.
          </p>
          <div className="sf-hero-stats">
            <span>{filteredProducts.length} productos visibles</span>
            <span>{cart.itemCount} items en carrito</span>
            <span>Checkout sin pago real</span>
          </div>
        </section>

        <div className="sf-layout">
          <FilterSidebar
            filters={filters}
            setFilters={setFilters}
            tcgOptions={tcgOptions}
            rarityOptions={rarityOptions}
            suggestions={suggestions}
          />

          <section className="sf-content-shell">
            {status === 'loading' && <p>Cargando catalogo...</p>}
            {error && <div className="sf-status warn">{error}</div>}
            <ProductGrid
              products={filteredProducts}
              onView={(product) => setSelected(product)}
              onAdd={(product) => {
                cart.addItem(
                  {
                    id: product.id,
                    name: product.cardName,
                    imageUrl: product.imageUrl,
                    price: product.finalPrice,
                    stock: product.quantity,
                  },
                  1
                );
                setCartOpen(true);
              }}
            />
          </section>
        </div>
      </div>

      <ShoppingCart
        open={cartOpen}
        onToggle={() => setCartOpen((prev) => !prev)}
        items={cart.items}
        itemCount={cart.itemCount}
        total={cart.total}
        updateQty={cart.updateQty}
        removeItem={cart.removeItem}
        clearCart={cart.clearCart}
      />

      {selected && (
        <div className="sf-modal" onClick={() => setSelected(null)}>
          <div className="sf-modal-card" onClick={(e) => e.stopPropagation()}>
            <img src={selected.imageUrl} alt={selected.cardName} />
            <div>
              <div className="sf-modal-head">
                <div>
                  <h2>{selected.cardName}</h2>
                  <p className="sf-muted">{selected.editionName}</p>
                </div>
                <button className="sf-ghost-btn" onClick={() => setSelected(null)}>Cerrar</button>
              </div>

              <div style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
                <span className="sf-tcg-pill">{selected.tcgId}</span>
                <RarityBadge rarity={selected.rarity} />
                <span className="sf-muted">Condicion: {selected.condition}</span>
              </div>

              <PriceDisplay price={selected.finalPrice} referencePrice={selected.referencePrice} />
              <p style={{ marginTop: 10 }} className="sf-muted">Stock disponible: {selected.quantity}</p>

              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                <button
                  className="sf-primary-btn"
                  onClick={() => {
                    cart.addItem(
                      {
                        id: selected.id,
                        name: selected.cardName,
                        imageUrl: selected.imageUrl,
                        price: selected.finalPrice,
                        stock: selected.quantity,
                      },
                      1
                    );
                    setCartOpen(true);
                  }}
                  disabled={selected.quantity <= 0}
                >
                  Agregar al carrito
                </button>
                <Link className="sf-ghost-btn" to={`/storefront/product/${selected.id}`}>
                  Ver pagina de producto
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
