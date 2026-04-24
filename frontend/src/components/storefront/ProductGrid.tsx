import { memo } from 'react';
import type { StorefrontProduct } from '../../hooks/useStorefront';
import ProductCard from './ProductCard';

interface ProductGridProps {
  products: StorefrontProduct[];
  onView: (product: StorefrontProduct) => void;
  onAdd: (product: StorefrontProduct) => void;
}

function ProductGrid({ products, onView, onAdd }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="sf-empty-state">
        <h3>Sin resultados</h3>
        <p>No encontramos cartas con esos filtros.</p>
      </div>
    );
  }

  return (
    <section className="sf-grid">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} onView={onView} onAdd={onAdd} />
      ))}
    </section>
  );
}

export default memo(ProductGrid);
