import { ReactNode, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useCartPersist from '../../hooks/useCartPersist';
import '../../pages/storefront_v2.css';

interface StorefrontLayoutProps {
  children: ReactNode;
  onSearch?: (query: string) => void;
}

export default function StorefrontLayout({ children, onSearch }: StorefrontLayoutProps) {
  const cart = useCartPersist();
  const { products, suggestions } = useStorefront();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [customer, setCustomer] = useState<any>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isCartBouncing, setIsCartBouncing] = useState(false);

  // Trigger bounce animation when cart total changes
  useEffect(() => {
    if (cart.items.length > 0) {
      setIsCartBouncing(true);
      const timer = setTimeout(() => setIsCartBouncing(false), 600);
      return () => clearTimeout(timer);
    }
  }, [cart.items.length]);

  useEffect(() => {
    const saved = localStorage.getItem('customer_data');
    if (saved) setCustomer(JSON.parse(saved));
  }, []);

  const visualSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return products
      .filter(p => p.cardName.toLowerCase().includes(q))
      .slice(0, 5);
  }, [products, search]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuggestions(false);
    if (onSearch) onSearch(search);
    navigate(`/storefront?q=${encodeURIComponent(search)}`);
  };

  const logout = () => {
    localStorage.removeItem('customer_token');
    localStorage.removeItem('customer_data');
    setCustomer(null);
    window.location.reload();
  };

  return (
    <div className="store-body">
      <nav className="store-nav">
        <div className="store-nav-container">
          <Link to="/storefront" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2 style={{ margin: 0, fontWeight: 900, letterSpacing: '-1px' }}>
              NET<span style={{ color: 'var(--store-primary)' }}>DECKER</span>
            </h2>
          </Link>

          <div className="store-search-bar">
            <form onSubmit={handleSearch}>
              <input 
                type="text" 
                placeholder="Busca tus cartas favoritas..." 
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              />
              <button type="submit" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer' }}>
                🔍
              </button>
            </form>

            {/* Visual Autocomplete Dropdown */}
            {showSuggestions && visualSuggestions.length > 0 && (
              <div style={{ 
                position: 'absolute', 
                top: '100%', 
                left: 0, 
                right: 0, 
                background: 'var(--store-surface)', 
                borderRadius: '0 0 12px 12px', 
                boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                zIndex: 2000,
                border: '1px solid var(--store-border)',
                marginTop: 4,
                overflow: 'hidden'
              }}>
                {visualSuggestions.map(p => (
                  <Link 
                    key={p.id} 
                    to={`/storefront/product/${p.id}`}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 12, 
                      padding: '10px 15px', 
                      textDecoration: 'none', 
                      color: 'inherit',
                      borderBottom: '1px solid var(--store-border)'
                    }}
                    onClick={() => setShowSuggestions(false)}
                  >
                    <img src={p.imageUrl} alt="" style={{ width: 35, height: 50, objectFit: 'contain', background: '#000', borderRadius: 4 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{p.cardName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--store-text-muted)' }}>{p.editionName}</div>
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--store-primary)', fontSize: '0.85rem' }}>
                      ${p.finalPrice.toLocaleString('es-CL')}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {customer ? (
              <div className="user-menu" style={{ position: 'relative' }}>
                <Link to="/storefront/profile" style={{ textDecoration: 'none', color: 'inherit', fontWeight: 600 }}>
                  Hola, {customer.name.split(' ')[0]}
                </Link>
                <button onClick={logout} style={{ marginLeft: 10, border: 'none', background: 'none', fontSize: '0.8rem', color: 'var(--store-primary)', cursor: 'pointer' }}>
                  Salir
                </button>
              </div>
            ) : (
              <Link to="/storefront/login" style={{ textDecoration: 'none', color: 'inherit', fontWeight: 600 }}>
                Iniciar Sesión
              </Link>
            )}

            <div style={{ position: 'relative' }} className="cart-container-nav">
              <Link to="/storefront/checkout" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span style={{ 
                  fontSize: '1.5rem', 
                  display: 'inline-block',
                  animation: isCartBouncing ? 'cart-bounce 0.6s cubic-bezier(0.36, 0.07, 0.19, 0.97) both' : 'none'
                }}>🛒</span>
                {cart.items.length > 0 && (
                  <span style={{ 
                    position: 'absolute', 
                    top: -8, 
                    right: -10, 
                    background: 'var(--store-primary)', 
                    color: 'white', 
                    borderRadius: '50%', 
                    width: 20, 
                    height: 20, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    fontWeight: 'bold'
                  }}>
                    {cart.items.length}
                  </span>
                )}
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Floating WhatsApp Button */}
      <a 
        href="https://wa.me/56912345678" 
        target="_blank" 
        rel="noreferrer"
        style={{ 
          position: 'fixed', 
          bottom: 30, 
          right: 30, 
          background: '#25d366', 
          color: 'white', 
          width: 60, 
          height: 60, 
          borderRadius: '50%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          fontSize: '2rem',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          zIndex: 9999,
          textDecoration: 'none'
        }}
        title="Contáctanos por WhatsApp"
      >
        💬
      </a>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
        {children}
      </main>

      <footer style={{ background: 'var(--store-surface)', padding: '60px 20px', marginTop: 60, borderTop: '1px solid var(--store-border)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 40 }}>
          <div>
            <h3 style={{ fontWeight: 900 }}>NETDECKER</h3>
            <p style={{ color: 'var(--store-text-muted)', fontSize: '0.9rem' }}>La plataforma definitiva para coleccionistas de TCG en Chile.</p>
          </div>
          <div>
            <h4 style={{ marginBottom: 15 }}>Categorías</h4>
            <ul style={{ listStyle: 'none', padding: 0, fontSize: '0.9rem', color: 'var(--store-text-muted)', lineHeight: '2' }}>
              <li>Pokémon TCG</li>
              <li>Magic: The Gathering</li>
              <li>One Piece Card Game</li>
              <li>Yu-Gi-Oh!</li>
            </ul>
          </div>
          <div>
            <h4 style={{ marginBottom: 15 }}>Ayuda</h4>
            <ul style={{ listStyle: 'none', padding: 0, fontSize: '0.9rem', color: 'var(--store-text-muted)', lineHeight: '2' }}>
              <li>Seguimiento de Pedidos</li>
              <li>Preguntas Frecuentes</li>
              <li>Contacto</li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
