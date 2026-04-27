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
  
  const { products, filteredProducts, status, filters, setFilters, tcgOptions, rarityOptions } = useStorefront();
  const cart = useCartPersist();
  
  const [selectedTCG, setSelectedTCG] = useState<string>('ALL');

  useEffect(() => {
    setFilters({ ...filters, query: searchQuery });
  }, [searchQuery]);

  const handleAddToCart = (product: StorefrontProduct) => {
    cart.addItem({
      id: product.id,
      name: product.cardName,
      price: product.finalPrice,
      imageUrl: product.imageUrl,
      quantity: 1,
    });
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

      {/* Category Pills */}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 10, marginBottom: 30 }}>
        <button 
          className={`category-pill ${selectedTCG === 'ALL' ? 'active' : ''}`}
          onClick={() => { setSelectedTCG('ALL'); setFilters({ ...filters, tcgId: 'ALL' }); }}
        >
          Todos los Juegos
        </button>
        {tcgOptions.map(tcg => (
          <button 
            key={tcg}
            className={`category-pill ${selectedTCG === tcg ? 'active' : ''}`}
            onClick={() => { setSelectedTCG(tcg); setFilters({ ...filters, tcgId: tcg }); }}
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
                <input type="checkbox" /> {rarity}
              </label>
            ))}
          </div>

          <div className="store-filter-group">
            <div className="store-filter-title">Condición</div>
            {['NM', 'LP', 'MP', 'HP', 'DMG'].map(cond => (
              <label key={cond} className="store-checkbox-label">
                <input type="checkbox" /> {cond}
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
            <h3 style={{ margin: 0 }}>Catálogo de Cartas ({filteredProducts.length})</h3>
            <select className="input input-sm" style={{ width: 200 }}>
              <option>Más recientes</option>
              <option>Precio: Menor a Mayor</option>
              <option>Precio: Mayor a Menor</option>
            </select>
          </div>

          {status === 'loading' ? (
            <div className="loading-spinner">Cargando increíbles cartas...</div>
          ) : (
            <div className="store-grid">
              {filteredProducts.map(product => (
                <article key={product.id} className="store-card">
                  <div className="store-card-image">
                    <img src={product.imageUrl} alt={product.cardName} loading="lazy" />
                  </div>
                  <div className="store-card-info">
                    <p style={{ fontSize: '0.75rem', color: 'var(--store-text-muted)', marginBottom: 4, fontWeight: 600 }}>{product.editionName}</p>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {product.cardName}
                    </h4>
                    <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
                      <RarityBadge rarity={product.rarity} />
                      <span className="badge badge-gray" style={{ fontSize: '0.65rem' }}>{product.condition}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="store-card-price">
                        <PriceDisplay amount={product.finalPrice} />
                      </div>
                      <button 
                        className="btn btn-sm" 
                        style={{ background: 'var(--store-primary)', color: 'white', border: 'none', borderRadius: 8 }}
                        onClick={() => handleAddToCart(product)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </StorefrontLayout>
  );
}
