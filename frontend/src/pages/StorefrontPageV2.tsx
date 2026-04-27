import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useStorefront, { type StorefrontProduct } from '../hooks/useStorefront';
import useCartPersist from '../hooks/useCartPersist';
import StorefrontLayout from '../components/storefront/StorefrontLayout';
import PriceDisplay from '../components/storefront/PriceDisplay';
import RarityBadge from '../components/storefront/RarityBadge';
import './storefront_v2.css';

export default function StorefrontPageV2() {
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  
  const { products, filteredProducts, status, filters, setFilters, tcgOptions, rarityOptions, visibleLimit, setVisibleLimit } = useStorefront();
  const cart = useCartPersist();
  const [addingId, setAddingId] = useState<string | null>(null);

  const displayedProducts = useMemo(() => filteredProducts.slice(0, visibleLimit), [filteredProducts, visibleLimit]);
  const hasMore = filteredProducts.length > visibleLimit;

  useEffect(() => {
    setFilters({ ...filters, query: searchQuery });
  }, [searchQuery]);

  const handleAddToCart = (product: StorefrontProduct) => {
    setAddingId(product.id);
    cart.addItem({
      id: product.id,
      name: product.cardName,
      price: product.finalPrice,
      imageUrl: product.imageUrl,
      quantity: 1,
    });
    setTimeout(() => setAddingId(null), 1000);
  };

  return (
    <StorefrontLayout>
      {/* Hero Section */}
      <section className="store-hero">
        <div className="store-hero-content">
          <span className="badge badge-primary" style={{ background: 'var(--store-primary)', marginBottom: 10 }}>Nueva Colección</span>
          <h1>Domina el Duelo</h1>
          <p style={{ fontSize: '1.2rem', opacity: 0.9, maxWidth: 500 }}>
            Encuentra las cartas más raras de One Piece, Pokémon y Magic con envío a todo Chile.
          </p>
          <button className="btn btn-primary" style={{ marginTop: 20, padding: '12px 40px', borderRadius: 50, background: 'var(--store-primary)', border: 'none' }}>
            Explorar Ahora
          </button>
        </div>
        <div className="store-hero-image" style={{ width: 400, height: 400, background: 'rgba(255,255,255,0.05)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
           <span style={{ fontSize: '10rem' }}>🃏</span>
        </div>
      </section>

      {/* Category Pills - Always visible */}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 15, marginBottom: 30, borderBottom: '1px solid var(--store-border)' }}>
        <button 
          className={`category-pill ${filters.tcgId === 'ALL' ? 'active' : ''}`}
          onClick={() => setFilters({ ...filters, tcgId: 'ALL' })}
        >
          Todos los Juegos
        </button>
        {tcgOptions.map(tcg => (
          <button 
            key={tcg}
            className={`category-pill ${filters.tcgId === tcg ? 'active' : ''}`}
            onClick={() => setFilters({ ...filters, tcgId: tcg })}
          >
            {tcg}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 30 }}>
        {/* Sidebar Filters */}
        <aside className="store-sidebar">
          <div className="store-filter-group">
            <div className="store-filter-title">Rareza</div>
            {rarityOptions.map(rarity => (
              <label key={rarity} className="store-checkbox-label">
                <input 
                  type="checkbox" 
                  checked={filters.rarity?.includes(rarity)}
                  onChange={() => {
                    const current = filters.rarity || [];
                    const next = current.includes(rarity) ? current.filter(r => r !== rarity) : [...current, rarity];
                    setFilters({ ...filters, rarity: next });
                  }}
                /> {rarity}
              </label>
            ))}
          </div>

          <div className="store-filter-group">
            <div className="store-filter-title">Rango de Precio</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input type="number" placeholder="Min" className="input input-sm" style={{ width: '50%' }} />
              <input type="number" placeholder="Max" className="input input-sm" style={{ width: '50%' }} />
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="store-main-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontWeight: 800 }}>Catálogo de Cartas ({filteredProducts.length})</h3>
            <select className="input input-sm" style={{ width: 200, borderRadius: 8 }}>
              <option>Más recientes</option>
              <option>Precio: Menor a Mayor</option>
              <option>Precio: Mayor a Menor</option>
            </select>
          </div>

          {status === 'loading' ? (
            <div className="store-grid">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="store-card skeleton-pulse">
                  <div className="store-card-image" style={{ background: 'var(--store-border)' }}></div>
                  <div className="store-card-info">
                    <div style={{ width: '60%', height: 10, background: 'var(--store-border)', marginBottom: 10, borderRadius: 4 }}></div>
                    <div style={{ width: '90%', height: 14, background: 'var(--store-border)', marginBottom: 15, borderRadius: 4 }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ width: '40%', height: 20, background: 'var(--store-border)', borderRadius: 4 }}></div>
                      <div style={{ width: 30, height: 30, background: 'var(--store-border)', borderRadius: 8 }}></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 30 }}>
              <div className="store-grid">
                {displayedProducts.map(product => (
                  <article key={product.id} className="store-card">
                    <div className="store-card-image">
                      <Link to={`/storefront/product/${product.id}`} style={{ display: 'block', width: '100%', height: '100%' }}>
                        <img src={product.imageUrl} alt={product.cardName} loading="lazy" />
                      </Link>
                    </div>
                    <div className="store-card-info">
                      <p style={{ fontSize: '0.7rem', color: 'var(--store-text-muted)', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase' }}>{product.editionName}</p>
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <Link to={`/storefront/product/${product.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{product.cardName}</Link>
                      </h4>
                      <div style={{ display: 'flex', gap: 5, marginBottom: 15, alignItems: 'center', justifyContent: 'space-between' }}>
                        <RarityBadge rarity={product.rarity} />
                        <span style={{ fontSize: '0.7rem', color: product.quantity > 0 ? 'var(--store-text-muted)' : '#ef4444', fontWeight: 600 }}>
                          {product.quantity > 0 ? `Stock: ${product.quantity}` : 'Agotado'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="store-card-price" style={{ color: 'var(--store-primary)', fontSize: '1.2rem', fontWeight: 800 }}>
                          {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(product.finalPrice)}
                        </div>
                        <button 
                          className={`btn btn-sm ${addingId === product.id ? 'adding' : ''}`}
                          style={{ 
                            background: addingId === product.id ? '#10b981' : 'var(--store-text)', 
                            color: 'var(--store-surface)', 
                            border: 'none', 
                            borderRadius: 8, 
                            width: 32, 
                            height: 32, 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            fontWeight: 900, 
                            cursor: product.quantity > 0 ? 'pointer' : 'not-allowed',
                            transition: 'all 0.2s ease',
                            transform: addingId === product.id ? 'scale(1.2)' : 'scale(1)'
                          }}
                          onClick={() => product.quantity > 0 && handleAddToCart(product)}
                          disabled={product.quantity <= 0}
                        >
                          {addingId === product.id ? '✓' : '+'}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {hasMore && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 40 }}>
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: '12px 60px', borderRadius: 50, fontWeight: 700, background: 'var(--store-surface)', border: '1px solid var(--store-border)' }}
                    onClick={() => setVisibleLimit(prev => prev + 20)}
                  >
                    Ver más productos
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </StorefrontLayout>
  );
}
