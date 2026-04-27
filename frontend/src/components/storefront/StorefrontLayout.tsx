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
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [customer, setCustomer] = useState<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem('customer_data');
    if (saved) setCustomer(JSON.parse(saved));
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
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

          <form className="store-search-bar" onSubmit={handleSearch}>
            <input 
              type="text" 
              placeholder="Busca tus cartas favoritas..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer' }}>
              🔍
            </button>
          </form>

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

            <Link to="/storefront/checkout" style={{ textDecoration: 'none', color: 'inherit', position: 'relative' }}>
              <span style={{ fontSize: '1.5rem' }}>🛒</span>
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
      </nav>

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
