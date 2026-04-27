import { Link, useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import useStorefront from '../hooks/useStorefront';
import useCartPersist from '../hooks/useCartPersist';
import apiClient from '../services/api';
import StorefrontLayout from '../components/storefront/StorefrontLayout';
import PriceDisplay from '../components/storefront/PriceDisplay';
import RarityBadge from '../components/storefront/RarityBadge';
import './storefront_v2.css';

export default function ProductDetailPage() {
  const { productId } = useParams();
  const { products, status } = useStorefront();
  const cart = useCartPersist();
  const product = products.find((entry) => entry.id === productId);

  const [reviews, setReviews] = useState<any[]>([]);
  const [stats, setStats] = useState({ average: 0, count: 0 });
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [newReview, setNewReview] = useState({ rating: 5, comment: '' });
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Load reviews on mount
  useEffect(() => {
    if (productId) {
      apiClient.get(`/public/reviews/${productId}`)
        .then(res => {
          setReviews(res.data.reviews || []);
          setStats(res.data.stats || { average: 0, count: 0 });
        })
        .catch(() => {});
    }
  }, [productId]);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('customer_token');
    if (!token) return alert('Debes iniciar sesión para opinar');

    setIsSubmittingReview(true);
    try {
      await apiClient.post('/storefront/auth/reviews', {
        listingId: productId,
        ...newReview
      });
      alert('¡Gracias por tu reseña!');
      setShowReviewForm(false);
      // Reload reviews...
      const res = await apiClient.get(`/public/reviews/${productId}`);
      setReviews(res.data.reviews);
      setStats(res.data.stats);
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Error al enviar reseña');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Related products logic
  const related = products
    .filter(p => p.editionName === product?.editionName && p.id !== product?.id)
    .slice(0, 4);

  // SEO & Social Sharing
  useEffect(() => {
    if (product) {
      document.title = `${product.cardName} - ${product.editionName} | Netdecker`;
      
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
          <div className="store-card-image" style={{ borderRadius: 20, boxShadow: 'var(--store-shadow)', background: '#000', overflow: 'hidden' }}>
            <img src={product.imageUrl} alt={product.cardName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <nav style={{ fontSize: '0.85rem', color: 'var(--store-text-muted)' }}>
              <Link to="/storefront" style={{ color: 'inherit' }}>Inicio</Link> / 
              <span style={{ marginLeft: 5 }}>{product.tcgId}</span> / 
              <span style={{ marginLeft: 5 }}>{product.editionName}</span>
            </nav>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: '2.5rem', fontWeight: 900, margin: 0 }}>{product.cardName}</h1>
              {stats.count > 0 && (
                <div style={{ background: '#fef3c7', color: '#92400e', padding: '4px 12px', borderRadius: 50, fontSize: '0.9rem', fontWeight: 700 }}>
                  ⭐ {stats.average.toFixed(1)}
                </div>
              )}
            </div>
            
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
                style={{ padding: '15px 40px', fontSize: '1.1rem', background: 'var(--store-primary)', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}
                onClick={() => cart.addItem({ id: product.id, name: product.cardName, price: product.finalPrice, imageUrl: product.imageUrl, stock: product.quantity, quantity: 1 })}
                disabled={product.quantity <= 0}
              >
                Añadir al Carrito
              </button>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--store-border)', margin: '20px 0' }} />
            
            <div style={{ fontSize: '0.9rem', color: 'var(--store-text-muted)', lineHeight: '1.6' }}>
              <p><strong>Envío rápido:</strong> Despachamos a todo Chile vía Blue Express o Starken.</p>
              <p><strong>Garantía Netdecker:</strong> Todas nuestras cartas son 100% auténticas y se encuentran en excelente estado (NM).</p>
            </div>
          </div>
        </div>

        {/* Reviews Section */}
        <div style={{ marginTop: 80, display: 'grid', gridTemplateColumns: '1fr 400px', gap: 60 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
              <h2 style={{ fontWeight: 900, margin: 0 }}>Opiniones de coleccionistas ({stats.count})</h2>
              <button 
                className="btn btn-ghost" 
                style={{ fontWeight: 600, color: 'var(--store-primary)' }}
                onClick={() => setShowReviewForm(!showReviewForm)}
              >
                {showReviewForm ? 'Cancelar' : 'Escribir una opinión'}
              </button>
            </div>

            {showReviewForm && (
              <form onSubmit={handleSubmitReview} className="card" style={{ padding: 25, borderRadius: 20, marginBottom: 40, border: '2px solid var(--store-primary)' }}>
                <h4 style={{ margin: '0 0 15px 0' }}>Tu evaluación</h4>
                <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                  {[1,2,3,4,5].map(star => (
                    <button 
                      key={star} 
                      type="button"
                      onClick={() => setNewReview({ ...newReview, rating: star })}
                      style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: star <= newReview.rating ? '#f59e0b' : '#ccc' }}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <textarea 
                  className="input" 
                  placeholder="¿Qué te pareció la carta? ¿El empaque fue bueno?..." 
                  style={{ minHeight: 100, marginBottom: 15 }}
                  value={newReview.comment}
                  onChange={(e) => setNewReview({ ...newReview, comment: e.target.value })}
                  required
                />
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ background: 'var(--store-primary)', border: 'none', width: '100%', padding: 12, fontWeight: 700 }}
                  disabled={isSubmittingReview}
                >
                  {isSubmittingReview ? 'Enviando...' : 'Publicar Reseña'}
                </button>
              </form>
            )}

            {reviews.length === 0 ? (
              <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--store-text-muted)' }}>
                Aún no hay reseñas para esta carta. ¡Sé el primero en comprarla y opinar!
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 20 }}>
                {reviews.map(rev => (
                  <div key={rev.id} className="card" style={{ padding: 20, borderRadius: 15 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontWeight: 700 }}>{rev.customer?.name}</span>
                      <span style={{ color: '#f59e0b' }}>{'★'.repeat(rev.rating)}{'☆'.repeat(5-rev.rating)}</span>
                    </div>
                    <p style={{ fontSize: '0.95rem', margin: 0 }}>{rev.comment}</p>
                    <div style={{ marginTop: 10, fontSize: '0.75rem', color: 'var(--store-text-muted)' }}>
                      {new Date(rev.createdAt).toLocaleDateString()} • <span style={{ color: '#10b981', fontWeight: 600 }}>Compra Verificada</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <aside>
            <div className="card" style={{ padding: 30, borderRadius: 20, background: 'var(--store-surface-strong)', textAlign: 'center' }}>
              <h3 style={{ margin: 0 }}>Puntaje General</h3>
              <div style={{ fontSize: '3.5rem', fontWeight: 900, color: 'var(--store-primary)', margin: '10px 0' }}>{stats.average.toFixed(1)}</div>
              <div style={{ color: '#f59e0b', fontSize: '1.2rem', marginBottom: 10 }}>{'★'.repeat(Math.round(stats.average))}{'☆'.repeat(5-Math.round(stats.average))}</div>
              <p style={{ fontSize: '0.85rem', color: 'var(--store-text-muted)' }}>Basado en {stats.count} evaluaciones reales.</p>
            </div>
          </aside>
        </div>

        {/* Related Products */}
        {related.length > 0 && (
          <div style={{ marginTop: 80, paddingTop: 60, borderTop: '1px solid var(--store-border)' }}>
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
                      <div className="store-card-price" style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--store-primary)' }}>
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
