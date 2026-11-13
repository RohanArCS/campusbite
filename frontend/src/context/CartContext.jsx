import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext.jsx';

const CartContext = createContext(null);
const CART_KEY = 'campusbite_cart';
export const DELIVERY_FEE = 30;

const emptyCart = { restaurant: null, items: [] };

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || emptyCart;
  } catch {
    return emptyCart;
  }
}

/** Cart state: one restaurant at a time; items are { id, name, price, quantity }. */
export function CartProvider({ children }) {
  const { user } = useAuth();
  const [cart, setCart] = useState(loadCart);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  // A cart belongs to a logged-in customer session; clear it on logout or role change.
  useEffect(() => {
    if (!user || user.role !== 'customer') setCart(emptyCart);
  }, [user]);

  const addItem = useCallback((restaurant, dish, quantity = 1) => {
    setCart((prev) => {
      const base = prev.restaurant && prev.restaurant.id !== restaurant.id ? emptyCart : prev;
      const existing = base.items.find((i) => i.id === dish.id);
      const items = existing
        ? base.items.map((i) => (i.id === dish.id ? { ...i, quantity: Math.min(50, i.quantity + quantity) } : i))
        : [...base.items, { id: dish.id, name: dish.name, price: dish.price, is_veg: dish.is_veg, quantity }];
      return { restaurant: { id: restaurant.id, name: restaurant.name }, items };
    });
  }, []);

  const updateQuantity = useCallback((dishId, quantity) => {
    setCart((prev) => {
      const items =
        quantity <= 0
          ? prev.items.filter((i) => i.id !== dishId)
          : prev.items.map((i) => (i.id === dishId ? { ...i, quantity: Math.min(50, quantity) } : i));
      return items.length ? { ...prev, items } : emptyCart;
    });
  }, []);

  const removeItem = useCallback((dishId) => updateQuantity(dishId, 0), [updateQuantity]);
  const clearCart = useCallback(() => setCart(emptyCart), []);

  const value = useMemo(() => {
    const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const count = cart.items.reduce((sum, i) => sum + i.quantity, 0);
    return {
      ...cart,
      count,
      subtotal,
      deliveryFee: count ? DELIVERY_FEE : 0,
      total: count ? subtotal + DELIVERY_FEE : 0,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      quantityOf: (dishId) => cart.items.find((i) => i.id === dishId)?.quantity || 0,
    };
  }, [cart, addItem, updateQuantity, removeItem, clearCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
