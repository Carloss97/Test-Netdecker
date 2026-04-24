import { Link, useParams } from 'react-router-dom';
import useStorefront from '../hooks/useStorefront';
import useCartPersist from '../hooks/useCartPersist';
import PriceDisplay from '../components/storefront/PriceDisplay';
import RarityBadge from '../components/storefront/RarityBadge';
import './storefront.css';

export default function ProductDetailPage() {
  const { productId } = useParams();
  const { products, status } = useStorefront();
  const cart = useCartPersist();
  const product = products.find((entry) => entry.id === productId);

  if (status === 'loading') {
    return (
      <div className="storefront-page">
        <div className="sf-detail-shell">Cargando producto...</div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="storefront-page">
        <div className="sf-detail-shell">
          <h2>Producto no encontrado</h2>
          <p className="sf-muted">El item que buscas no existe o fue removido del catalogo.</p>
          <Link className="sf-primary-btn" to="/storefront">Volver al catalogo</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="storefront-page">
      <div className="sf-detail-shell">
        <Link to="/storefront" className="sf-ghost-btn">Volver</Link>
        <div className="sf-detail-grid">
          <div>
            <img className="sf-detail-image" src={product.imageUrl} alt={product.cardName} />
          </div>
          <div>
            <h1>{product.cardName}</h1>
            <p className="sf-muted">{product.editionName}</p>
            <div style={{ display: 'flex', gap: 10, margin: '12px 0' }}>
              <span className="sf-tcg-pill">{product.tcgId}</span>
              <RarityBadge rarity={product.rarity} />
              <span className="sf-muted">Condicion {product.condition}</span>
            </div>
            <PriceDisplay price={product.finalPrice} referencePrice={product.referencePrice} />
            <p style={{ marginTop: 8 }} className="sf-muted">Stock disponible: {product.quantity}</p>
            <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="sf-primary-btn"
                onClick={() =>
                  cart.addItem(
                    {
                      id: product.id,
                      name: product.cardName,
                      imageUrl: product.imageUrl,
                      price: product.finalPrice,
                      stock: product.quantity,
                    },
                    1
                  )
                }
                disabled={product.quantity <= 0}
              >
                Agregar al carrito
              </button>
              <Link className="sf-ghost-btn" to="/storefront/checkout">Ir al checkout</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
