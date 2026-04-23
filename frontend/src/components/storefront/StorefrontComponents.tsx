import React, { useState } from 'react';
import { Heart, ShoppingCart, Star, Zap, TrendingUp } from 'lucide-react';

/**
 * ProductCard.tsx - Reusable TCG Card Display Component
 * Shows: Image, Name, Price, Stock, Rating, CTA buttons
 */
export interface Product {
  id: string;
  name: string;
  image: string;
  price: number; // In CLP
  referencePrice?: number; // In USD
  stock: number;
  condition: 'Mint' | 'NM' | 'LP' | 'MP' | 'PO';
  tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON';
  rarity: string;
  reviews: number;
  rating: number;
  set?: string;
  cardNumber?: string;
  isTrending?: boolean;
  discount?: number; // percentage
}

interface ProductCardProps {
  product: Product;
  onAddToCart: (productId: string, quantity: number) => void;
  onViewDetails: (productId: string) => void;
  onToggleWishlist: (productId: string) => void;
  isWishlisted?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onAddToCart,
  onViewDetails,
  onToggleWishlist,
  isWishlisted = false,
}) => {
  const [quantity, setQuantity] = useState(1);
  const [isHovered, setIsHovered] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);

  const handleAddToCart = () => {
    onAddToCart(product.id, quantity);
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  const getConditionColor = (condition: string) => {
    const colors: Record<string, string> = {
      'Mint': 'bg-emerald-100 text-emerald-800',
      'NM': 'bg-green-100 text-green-800',
      'LP': 'bg-yellow-100 text-yellow-800',
      'MP': 'bg-orange-100 text-orange-800',
      'PO': 'bg-red-100 text-red-800',
    };
    return colors[condition] || 'bg-gray-100 text-gray-800';
  };

  const getTCGColor = (tcg: string) => {
    const colors: Record<string, string> = {
      'MAGIC': 'bg-purple-500',
      'POKEMON': 'bg-yellow-500',
      'YUGIOH': 'bg-blue-600',
      'ONE_PIECE': 'bg-orange-600',
      'DIGIMON': 'bg-red-500',
    };
    return colors[tcg] || 'bg-gray-500';
  };

  const isOutOfStock = product.stock === 0;
  const finalPrice = product.discount 
    ? Math.round(product.price * (1 - product.discount / 100))
    : product.price;

  return (
    <div
      className="bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300 overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Image Container */}
      <div className="relative bg-gray-100 aspect-[2/3] overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          className={`w-full h-full object-cover transition-transform duration-300 ${
            isHovered ? 'scale-110' : 'scale-100'
          }`}
        />

        {/* Overlays */}
        {product.isTrending && (
          <div className="absolute top-2 left-2 bg-red-500 text-white px-3 py-1 rounded-full flex items-center gap-1 text-xs font-bold">
            <TrendingUp size={14} />
            TRENDING
          </div>
        )}

        {product.discount && (
          <div className="absolute top-2 right-2 bg-red-500 text-white px-3 py-1 rounded-lg text-sm font-bold">
            -{product.discount}%
          </div>
        )}

        {isOutOfStock && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="text-white font-bold text-lg">OUT OF STOCK</span>
          </div>
        )}

        {/* Wishlist Button */}
        <button
          onClick={() => onToggleWishlist(product.id)}
          className={`absolute top-3 right-3 p-2 rounded-full transition-all ${
            isWishlisted
              ? 'bg-red-500 text-white'
              : 'bg-white/80 text-gray-600 hover:bg-white'
          }`}
        >
          <Heart size={18} fill={isWishlisted ? 'currentColor' : 'none'} />
        </button>

        {/* Hover Action Overlay */}
        {isHovered && !isOutOfStock && (
          <button
            onClick={() => onViewDetails(product.id)}
            className="absolute inset-0 bg-black/40 flex items-center justify-center text-white font-semibold hover:bg-black/50 transition-colors"
          >
            VIEW DETAILS
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* TCG Badge + Rarity */}
        <div className="flex justify-between items-center mb-2">
          <span className={`text-xs font-bold text-white px-2 py-1 rounded ${getTCGColor(product.tcg)}`}>
            {product.tcg.split('_').join(' ')}
          </span>
          <span className="text-xs font-semibold text-gray-500">
            {product.set && product.set.toUpperCase()}
          </span>
        </div>

        {/* Product Name */}
        <h3 className="font-bold text-sm line-clamp-2 mb-2 text-gray-900">
          {product.name}
        </h3>

        {/* Condition & Rating */}
        <div className="flex justify-between items-center mb-3">
          <span className={`text-xs px-2 py-1 rounded font-semibold ${getConditionColor(product.condition)}`}>
            {product.condition}
          </span>
          <div className="flex items-center gap-1">
            <Star size={14} className="fill-amber-400 text-amber-400" />
            <span className="text-xs font-semibold text-gray-700">
              {product.rating.toFixed(1)}
            </span>
            <span className="text-xs text-gray-500">({product.reviews})</span>
          </div>
        </div>

        {/* Pricing */}
        <div className="mb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-indigo-600">
              ${finalPrice.toLocaleString('es-CL')}
            </span>
            {product.discount && (
              <span className="text-sm text-gray-400 line-through">
                ${product.price.toLocaleString('es-CL')}
              </span>
            )}
          </div>
          {product.referencePrice && (
            <span className="text-xs text-gray-500">
              Reference: USD ${product.referencePrice.toFixed(2)}
            </span>
          )}
        </div>

        {/* Stock Status */}
        <div className="mb-4">
          {isOutOfStock ? (
            <span className="text-sm font-semibold text-red-600">Out of Stock</span>
          ) : product.stock <= 3 ? (
            <span className="text-sm font-semibold text-orange-600">
              Only {product.stock} left!
            </span>
          ) : (
            <span className="text-sm font-semibold text-green-600">In Stock</span>
          )}
        </div>

        {/* CTA Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleAddToCart}
            disabled={isOutOfStock}
            className={`flex-1 py-2 px-3 rounded font-semibold flex items-center justify-center gap-2 transition-colors ${
              addedToCart
                ? 'bg-green-500 text-white'
                : isOutOfStock
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            <ShoppingCart size={16} />
            {addedToCart ? 'Added!' : 'Add to Cart'}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * FilterSidebar.tsx - Advanced Filter Panel
 */
export interface Filters {
  tcgs: string[];
  rarities: string[];
  conditions: string[];
  priceRange: [number, number];
  stockOnly: boolean;
  isTrendingOnly: boolean;
}

interface FilterSidebarProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  priceMax?: number;
}

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
  filters,
  onFilterChange,
  priceMax = 1000000,
}) => {
  const TCG_OPTIONS = ['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON'];
  const RARITY_OPTIONS = ['Common', 'Uncommon', 'Rare', 'Mythic', 'Secret'];
  const CONDITION_OPTIONS = ['Mint', 'NM', 'LP', 'MP', 'PO'];

  const handleTCGToggle = (tcg: string) => {
    const tcgs = filters.tcgs.includes(tcg)
      ? filters.tcgs.filter(t => t !== tcg)
      : [...filters.tcgs, tcg];
    onFilterChange({ ...filters, tcgs });
  };

  const handleRarityToggle = (rarity: string) => {
    const rarities = filters.rarities.includes(rarity)
      ? filters.rarities.filter(r => r !== rarity)
      : [...filters.rarities, rarity];
    onFilterChange({ ...filters, rarities });
  };

  const handleConditionToggle = (condition: string) => {
    const conditions = filters.conditions.includes(condition)
      ? filters.conditions.filter(c => c !== condition)
      : [...filters.conditions, condition];
    onFilterChange({ ...filters, conditions });
  };

  const handlePriceChange = (type: 'min' | 'max', value: number) => {
    const newRange: [number, number] = [...filters.priceRange];
    if (type === 'min') newRange[0] = value;
    else newRange[1] = value;
    onFilterChange({ ...filters, priceRange: newRange });
  };

  const clearAllFilters = () => {
    onFilterChange({
      tcgs: [],
      rarities: [],
      conditions: [],
      priceRange: [0, priceMax],
      stockOnly: false,
      isTrendingOnly: false,
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 sticky top-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-bold">Filters</h2>
        <button
          onClick={clearAllFilters}
          className="text-sm text-indigo-600 hover:text-indigo-700 font-semibold"
        >
          Clear All
        </button>
      </div>

      {/* TCG Filter */}
      <div className="mb-6">
        <h3 className="font-bold text-sm text-gray-900 mb-3">TCG</h3>
        <div className="space-y-2">
          {TCG_OPTIONS.map(tcg => (
            <label key={tcg} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.tcgs.includes(tcg)}
                onChange={() => handleTCGToggle(tcg)}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <span className="text-sm text-gray-700">{tcg.split('_').join(' ')}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Rarity Filter */}
      <div className="mb-6">
        <h3 className="font-bold text-sm text-gray-900 mb-3">Rarity</h3>
        <div className="space-y-2">
          {RARITY_OPTIONS.map(rarity => (
            <label key={rarity} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.rarities.includes(rarity)}
                onChange={() => handleRarityToggle(rarity)}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <span className="text-sm text-gray-700">{rarity}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Condition Filter */}
      <div className="mb-6">
        <h3 className="font-bold text-sm text-gray-900 mb-3">Condition</h3>
        <div className="space-y-2">
          {CONDITION_OPTIONS.map(condition => (
            <label key={condition} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.conditions.includes(condition)}
                onChange={() => handleConditionToggle(condition)}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <span className="text-sm text-gray-700">{condition}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Price Range Filter */}
      <div className="mb-6">
        <h3 className="font-bold text-sm text-gray-900 mb-3">Price Range</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-600">Min: ${filters.priceRange[0].toLocaleString('es-CL')}</label>
            <input
              type="range"
              min="0"
              max={priceMax}
              value={filters.priceRange[0]}
              onChange={e => handlePriceChange('min', Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">Max: ${filters.priceRange[1].toLocaleString('es-CL')}</label>
            <input
              type="range"
              min="0"
              max={priceMax}
              value={filters.priceRange[1]}
              onChange={e => handlePriceChange('max', Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Special Filters */}
      <div className="space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.stockOnly}
            onChange={e => onFilterChange({ ...filters, stockOnly: e.target.checked })}
            className="w-4 h-4 text-indigo-600 rounded"
          />
          <span className="text-sm text-gray-700">In Stock Only</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.isTrendingOnly}
            onChange={e => onFilterChange({ ...filters, isTrendingOnly: e.target.checked })}
            className="w-4 h-4 text-indigo-600 rounded"
          />
          <span className="text-sm text-gray-700">Trending Now</span>
        </label>
      </div>
    </div>
  );
};

/**
 * PriceDisplay.tsx - Smart Price Component
 */
interface PriceDisplayProps {
  clpPrice: number;
  usdReference?: number;
  discountPercent?: number;
  size?: 'sm' | 'md' | 'lg';
}

export const PriceDisplay: React.FC<PriceDisplayProps> = ({
  clpPrice,
  usdReference,
  discountPercent,
  size = 'md',
}) => {
  const finalPrice = discountPercent
    ? Math.round(clpPrice * (1 - discountPercent / 100))
    : clpPrice;

  const sizeClasses = {
    sm: 'text-lg font-bold text-indigo-600',
    md: 'text-2xl font-bold text-indigo-600',
    lg: 'text-3xl font-bold text-indigo-600',
  };

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className={sizeClasses[size]}>
          ${finalPrice.toLocaleString('es-CL')}
        </span>
        {discountPercent && (
          <span className="text-sm text-gray-400 line-through">
            ${clpPrice.toLocaleString('es-CL')}
          </span>
        )}
      </div>
      {usdReference && (
        <span className="text-xs text-gray-500">
          Reference: USD ${usdReference.toFixed(2)}
        </span>
      )}
    </div>
  );
};

/**
 * RarityBadge.tsx - Visual Rarity Indicator
 */
interface RarityBadgeProps {
  rarity: string;
  size?: 'sm' | 'md' | 'lg';
}

export const RarityBadge: React.FC<RarityBadgeProps> = ({ rarity, size = 'md' }) => {
  const rarityConfig: Record<string, { color: string; emoji: string }> = {
    'Common': { color: 'bg-gray-200 text-gray-800', emoji: '⚪' },
    'Uncommon': { color: 'bg-green-200 text-green-800', emoji: '🟢' },
    'Rare': { color: 'bg-blue-200 text-blue-800', emoji: '🔵' },
    'Mythic': { color: 'bg-red-200 text-red-800', emoji: '🔴' },
    'Secret': { color: 'bg-purple-200 text-purple-800', emoji: '💜' },
  };

  const config = rarityConfig[rarity] || rarityConfig['Common'];

  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
    lg: 'text-base px-4 py-2',
  };

  return (
    <span className={`${config.color} ${sizeClasses[size]} rounded font-semibold inline-flex items-center gap-1`}>
      {config.emoji} {rarity}
    </span>
  );
};

export default {
  ProductCard,
  FilterSidebar,
  PriceDisplay,
  RarityBadge,
};
