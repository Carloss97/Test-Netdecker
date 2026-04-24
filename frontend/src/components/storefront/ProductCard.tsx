import { memo } from 'react';
import type { StorefrontProduct } from '../../hooks/useStorefront';
import PriceDisplay from './PriceDisplay';
import RarityBadge from './RarityBadge';

interface ProductCardProps {
  product: StorefrontProduct;
  onView: (product: StorefrontProduct) => void;
  onAdd: (product: StorefrontProduct) => void;
}

function ProductCard({ product, onView, onAdd }: ProductCardProps) {
  return (
    <article className="sf-product-card">
      <button type="button" className="sf-image-button" onClick={() => onView(product)}>
        <img src={product.imageUrl} alt={product.cardName} loading="lazy" />
      </button>
      <div className="sf-product-meta">
        <div className="sf-product-top">
          <span className="sf-tcg-pill">{product.tcgId}</span>
          <RarityBadge rarity={product.rarity} />
        </div>
        <h4>{product.cardName}</h4>
        <p>{product.editionName}</p>
        <div className="sf-product-bottom">
          <PriceDisplay price={product.finalPrice} referencePrice={product.referencePrice} />
          <div className="sf-stock">Stock: {product.quantity}</div>
        </div>
      </div>
      <div className="sf-card-actions">
        <button type="button" className="sf-ghost-btn" onClick={() => onView(product)}>
          Ver detalle
        </button>
        <button type="button" className="sf-primary-btn" onClick={() => onAdd(product)} disabled={product.quantity <= 0}>
          Agregar
        </button>
      </div>
    </article>
  );
}

export default memo(ProductCard);
