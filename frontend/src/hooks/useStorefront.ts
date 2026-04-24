import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import apiClient from '../services/api';
import { logClientError, logClientInfo } from '../utils/observability';

export type StorefrontProduct = {
  id: string;
  cardName: string;
  editionName: string;
  tcgId: string;
  rarity: string;
  condition: string;
  quantity: number;
  finalPrice: number;
  referencePrice?: number;
  imageUrl: string;
};

export type StorefrontFilters = {
  query: string;
  tcgId: string;
  rarity: string;
  minPrice: string;
  maxPrice: string;
};

type IndexedStorefrontProduct = StorefrontProduct & {
  cardNameLc: string;
  rarityLc: string;
};

const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;charset=UTF-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 448"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e293b"/></linearGradient></defs><rect width="320" height="448" rx="24" fill="url(#g)"/><rect x="28" y="28" width="264" height="392" rx="18" fill="none" stroke="#94a3b8" stroke-opacity="0.4" stroke-width="3"/><circle cx="160" cy="150" r="52" fill="#38bdf8" fill-opacity="0.14"/><path d="M160 108l14 30 33 4-24 23 6 33-29-15-29 15 6-33-24-23 33-4z" fill="#f8fafc" fill-opacity="0.88"/><text x="160" y="332" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#e2e8f0">TCGCSV</text></svg>',
  );

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeProduct(raw: any, index: number): StorefrontProduct {
  const cardName = String(raw?.cardName || raw?.card?.cardName || `Producto ${index + 1}`);
  const editionName = String(raw?.editionName || raw?.edition?.editionName || raw?.editionCode || 'Unknown Edition');
  const tcgId = String(raw?.tcgId || raw?.card?.tcgId || raw?.tcg || 'MAGIC').toUpperCase();
  const rarity = String(raw?.rarity || raw?.card?.rarity || 'C').toUpperCase();
  const condition = String(raw?.condition || raw?.state || 'NM').toUpperCase();
  const quantity = toNumber(raw?.quantity ?? raw?.stock, 0);
  const finalPrice = toNumber(raw?.finalPrice ?? raw?.price, 0);
  const referencePrice = toNumber(raw?.referencePrice ?? raw?.priceUsd, 0);
  const imageUrl = String(
    raw?.imageUrl ||
      raw?.card?.imageUrl ||
      raw?.image ||
      PLACEHOLDER_IMAGE
  );

  return {
    id: String(raw?.id || raw?.listingId || `${tcgId}-${index}`),
    cardName,
    editionName,
    tcgId,
    rarity,
    condition,
    quantity,
    finalPrice,
    referencePrice: referencePrice > 0 ? referencePrice : undefined,
    imageUrl,
  };
}

function extractProducts(payload: any): StorefrontProduct[] {
  const arrayCandidate =
    (Array.isArray(payload?.data) && payload.data) ||
    (Array.isArray(payload?.listings) && payload.listings) ||
    (Array.isArray(payload) && payload) ||
    [];

  if (arrayCandidate.length === 0) {
    return [];
  }

  return arrayCandidate.map((entry: any, index: number) => normalizeProduct(entry, index));
}

export default function useStorefront() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  const [filters, setFilters] = useState<StorefrontFilters>({
    query: '',
    tcgId: 'ALL',
    rarity: 'ALL',
    minPrice: '',
    maxPrice: '',
  });
  const deferredQuery = useDeferredValue(filters.query);

  const loadProducts = useCallback(async (reason: 'initial-load' | 'manual-retry' | 'store-change' = 'initial-load') => {
    setStatus('loading');
    setError(null);

    try {
      const resp = await apiClient.get('/listings/available');
      const normalized = extractProducts(resp?.data);
      setProducts(normalized);
      setStatus('ready');
      logClientInfo({
        area: 'storefront-hook',
        action: 'load-products',
        message: 'Storefront products loaded',
        context: { reason, count: normalized.length },
      });
    } catch (err) {
      setProducts([]);
      setStatus('error');
      setError('No se pudo cargar catálogo remoto.');
      logClientError({
        area: 'storefront-hook',
        action: 'load-products',
        message: 'Failed loading storefront products from API',
        context: { reason },
        error: err,
      });
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!mounted) return;
      await loadProducts('initial-load');
    };

    void load();

    const onStoreChanged = () => {
      void loadProducts('store-change');
    };

    window.addEventListener('netdecker:store-changed', onStoreChanged as EventListener);
    return () => {
      mounted = false;
      window.removeEventListener('netdecker:store-changed', onStoreChanged as EventListener);
    };
  }, [loadProducts]);

  const indexedProducts = useMemo<IndexedStorefrontProduct[]>(() => (
    products.map((item) => ({
      ...item,
      cardNameLc: item.cardName.toLowerCase(),
      rarityLc: item.rarity.toLowerCase(),
    }))
  ), [products]);

  const suggestions = useMemo(() => {
    const query = deferredQuery.trim().toLowerCase();
    if (!query) return [];
    const unique = new Set<string>();
    for (const item of indexedProducts) {
      if (item.cardNameLc.includes(query)) {
        unique.add(item.cardName);
      }
      if (unique.size >= 8) break;
    }
    return Array.from(unique);
  }, [indexedProducts, deferredQuery]);

  const filteredProducts = useMemo(() => {
    const minPrice = filters.minPrice ? Number(filters.minPrice) : undefined;
    const maxPrice = filters.maxPrice ? Number(filters.maxPrice) : undefined;
    const query = deferredQuery.trim().toLowerCase();

    return indexedProducts.filter((item) => {
      if (query && !item.cardNameLc.includes(query)) return false;
      if (filters.tcgId !== 'ALL' && item.tcgId !== filters.tcgId) return false;
      if (filters.rarity !== 'ALL' && item.rarityLc !== filters.rarity.toLowerCase()) return false;
      if (typeof minPrice === 'number' && Number.isFinite(minPrice) && item.finalPrice < minPrice) return false;
      if (typeof maxPrice === 'number' && Number.isFinite(maxPrice) && item.finalPrice > maxPrice) return false;
      return true;
    });
  }, [indexedProducts, filters, deferredQuery]);

  const tcgOptions = useMemo(() => ['ALL', ...Array.from(new Set(products.map((entry) => entry.tcgId)))], [products]);
  const rarityOptions = useMemo(() => ['ALL', ...Array.from(new Set(products.map((entry) => entry.rarity)))], [products]);

  return {
    status,
    error,
    products,
    filteredProducts,
    suggestions,
    filters,
    setFilters,
    tcgOptions,
    rarityOptions,
    reload: () => loadProducts('manual-retry'),
  };
}
