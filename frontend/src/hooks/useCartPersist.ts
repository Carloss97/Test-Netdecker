import { useEffect, useMemo, useState } from 'react';

export type CartItem = {
  id: string;
  name: string;
  imageUrl: string;
  price: number;
  quantity: number;
  stock: number;
};

const CART_KEY = 'storefront_cart_v1';
const CART_SYNC_EVENT = 'netdecker:cart-sync';

function readCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function useCartPersist() {
  const [items, setItems] = useState<CartItem[]>(() => readCart());

  // Listen for changes from other components
  useEffect(() => {
    const onSync = () => {
      setItems(readCart());
    };
    window.addEventListener(CART_SYNC_EVENT, onSync);
    return () => window.removeEventListener(CART_SYNC_EVENT, onSync);
  }, []);

  const persist = (newItems: CartItem[]) => {
    setItems(newItems);
    localStorage.setItem(CART_KEY, JSON.stringify(newItems));
    window.dispatchEvent(new Event(CART_SYNC_EVENT));
  };

  const addItem = (item: Omit<CartItem, 'quantity'>, quantity = 1) => {
    // SECURITY: Ensure price is never lost or set to 0 if it exists
    if (!item.price && item.price !== 0) return;

    const current = readCart();
    const existing = current.find((entry) => entry.id === item.id);
    let nextItems: CartItem[];

    if (!existing) {
      nextItems = [...current, { ...item, quantity: Math.max(1, quantity) }];
    } else {
      const nextQty = existing.quantity + quantity;
      nextItems = current.map((entry) => 
        entry.id === item.id ? { ...entry, quantity: nextQty } : entry
      );
    }
    persist(nextItems);
  };

  const updateQty = (id: string, quantity: number) => {
    const current = readCart();
    const nextItems = current
      .map((entry) => {
        if (entry.id !== id) return entry;
        return { ...entry, quantity: Math.max(0, quantity) };
      })
      .filter((entry) => entry.quantity > 0);
    persist(nextItems);
  };

  const removeItem = (id: string) => {
    const current = readCart();
    persist(current.filter((entry) => entry.id !== id));
  };

  const clearCart = () => persist([]);

  const itemCount = useMemo(() => items.reduce((acc, item) => acc + item.quantity, 0), [items]);
  const total = useMemo(() => items.reduce((acc, item) => acc + item.quantity * item.price, 0), [items]);

  return {
    items,
    itemCount,
    total,
    addItem,
    updateQty,
    removeItem,
    clearCart,
  };
}
