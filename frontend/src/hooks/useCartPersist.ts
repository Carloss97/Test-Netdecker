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

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch {
      // ignore storage failures
    }
  }, [items]);

  const addItem = (item: Omit<CartItem, 'quantity'>, quantity = 1) => {
    setItems((prev) => {
      const existing = prev.find((entry) => entry.id === item.id);
      if (!existing) {
        return [...prev, { ...item, quantity: Math.max(1, Math.min(quantity, item.stock || quantity)) }];
      }

      const nextQty = Math.max(1, Math.min(existing.quantity + quantity, item.stock || existing.stock));
      return prev.map((entry) => (entry.id === item.id ? { ...entry, quantity: nextQty, stock: item.stock } : entry));
    });
  };

  const updateQty = (id: string, quantity: number) => {
    setItems((prev) =>
      prev
        .map((entry) => {
          if (entry.id !== id) return entry;
          const next = Math.max(0, Math.min(quantity, entry.stock || quantity));
          return { ...entry, quantity: next };
        })
        .filter((entry) => entry.quantity > 0)
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((entry) => entry.id !== id));
  };

  const clearCart = () => setItems([]);

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
