import { Link, useParams } from 'react-router-dom';
import useStorefront from '../hooks/useStorefront';
import useCartPersist from '../hooks/useCartPersist';
import StorefrontLayout from '../components/storefront/StorefrontLayout';
import PriceDisplay from '../components/storefront/PriceDisplay';
import RarityBadge from '../components/storefront/RarityBadge';
import './storefront_v2.css';

export default function ProductDetailPage() {
  const { productId } = useParams();
  const { products, status } = useStorefront();
  const cart = useCartPersist();
  const product = products.find((entry) => entry.id === productId);

  // SEO & Social Sharing
  useEffect(() => {
    if (product) {
      document.title = `${product.cardName} - ${product.editionName} | Netdecker`;
      
      // Update meta tags for social sharing (Open Graph)
      const metaTags = {
        'og:title': `${product.cardName} - ${product.editionName}`,
        'og:description': `Compra ${product.cardName} (${product.rarity}) de la edición ${product.editionName} en Netdecker Chile.`,
        'og:image': product.imageUrl || '',
        'og:price:amount': String(product.finalPrice),
        'og:price:currency': 'CLP'
      };

      Object.entries(metaTags).forEach(([property, content]) => {
        let el = document.querySelector(`meta[property="${property}"]`);
        if (!el) {
          el = document.createElement('meta');
          el.setAttribute('property', property);
          document.head.appendChild(el);
        }
        el.setAttribute('content', content);
      });
    }
  }, [product]);

  // Related products logic
  const related = products
    .filter(p => p.editionName === product?.editionName && p.id !== product?.id)
    .slice(0, 4);

  if (status === 'loading') {
    return (
      <StorefrontLayout>
        <div style={{ padding: '40px 0' }}>
          <div className="skeleton-pulse" style={{ height: 400, background: 'var(--store-surface)', borderRadius: 20 }}></div>
        </div>
      </StorefrontLayout>
    );
  }

  if (!product) {
    return (
      <StorefrontLayout>
        <div style={{ padding: '100px 0', textAlign: 'center' }}>
          <h2>Producto no encontrado</h2>
          <Link to="/storefront" style={{ color: 'var(--store-primary)' }}>Volver al catálogo</Link>
        </div>
      </StorefrontLayout>
    );
  }

  return (
    <StorefrontLayout>
      <div style={{ padding: '40px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 450px) 1fr', gap: 60 }}>
          <div className="store-card-image" style={{ borderRadius: 20, boxShadow: 'var(--store-shadow)' }}>
            <img src={product.imageUrl} alt={product.cardName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <nav style={{ fontSize: '0.85rem', color: 'var(--store-text-muted)' }}>
              <Link to="/storefront" style={{ color: 'inherit' }}>Inicio</Link> / 
              <span style={{ marginLeft: 5 }}>{product.tcgId}</span> / 
              <span style={{ marginLeft: 5 }}>{product.editionName}</span>
            </nav>

            <h1 style={{ fontSize: '2.5rem', fontWeight: 900, margin: 0 }}>{product.cardName}</h1>
            
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <RarityBadge rarity={product.rarity} />
              <span className="badge badge-gray">{product.tcgId}</span>
              <span className="badge badge-primary" style={{ background: 'var(--store-primary)' }}>Stock: {product.quantity}</span>
            </div>

            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--store-primary)', margin: '10px 0' }}>
              {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(product.finalPrice)}
            </div>

            <div style={{ display: 'flex', gap: 15, marginTop: 20 }}>
              <button 
                className="btn btn-primary" 
                style={{ padding: '15px 40px', fontSize: '1.1rem', background: 'var(--store-primary)', border: 'none', borderRadius: 12, fontWeight: 700 }}
                onClick={() => cart.addItem({ id: product.id, name: product.cardName, price: product.finalPrice, imageUrl: product.imageUrl, quantity: 1 })}
                disabled={product.quantity <= 0}
              >
                Añadir al Carrito
              </button>
              <Link 
                to="/storefront/checkout" 
                className="btn btn-secondary"
                style={{ padding: '15px 30px', borderRadius: 12, fontWeight: 600, border: '1px solid var(--store-border)', textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center' }}
              >
                Comprar Ahora
              </Link>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--store-border)', margin: '20px 0' }} />
            
            <div style={{ fontSize: '0.9rem', color: 'var(--store-text-muted)', lineHeight: '1.6' }}>
              <p><strong>Envío rápido:</strong> Despachamos a todo Chile vía Blue Express o Starken.</p>
              <p><strong>Garantía Netdecker:</strong> Todas nuestras cartas son 100% auténticas y se encuentran en excelente estado (NM).</p>
            </div>
          </div>
        </div>

        {/* B1: Related Products */}
        {related.length > 0 && (
          <div style={{ marginTop: 80 }}>
            <h2 style={{ fontWeight: 900, marginBottom: 30 }}>Más cartas de esta edición</h2>
            <div className="store-grid">
              {related.map(p => (
                <Link key={p.id} to={`/storefront/product/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <article className="store-card">
                    <div className="store-card-image">
                      <img src={p.imageUrl} alt={p.cardName} loading="lazy" />
                    </div>
                    <div className="store-card-info">
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.cardName}</h4>
                      <div className="store-card-price" style={{ fontSize: '1.1rem' }}>
                        {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(p.finalPrice)}
                      </div>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </StorefrontLayout>
  );
}
