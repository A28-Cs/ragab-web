'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CartItem, Product } from '../types';
import { cartService, type PricedCart } from '../services/cartService';
import { ApiError } from '../lib/apiClient';
import { useAuth } from './AuthContext';
import { useLanguage } from './LanguageContext';
import { useToast } from '../components/ui/Toast';

interface CartContextType {
  cart: CartItem[];
  /** True until the first server response (render skeletons, not an empty cart). */
  isLoading: boolean;
  /** True while a mutation is in flight. */
  isSyncing: boolean;
  /** `variantId` omitted ⇒ the product's default unit. */
  addToCart: (product: Product, quantity?: number, variantId?: string) => Promise<void>;
  removeFromCart: (productId: string, variantId?: string) => Promise<void>;
  updateQuantity: (productId: string, quantity: number, variantId?: string) => Promise<void>;
  /** The line for a product unit (default unit when `variantId` is omitted). */
  lineFor: (productId: string, variantId?: string) => CartItem | undefined;
  clearCart: () => Promise<void>;
  refresh: () => Promise<void>;
  totalItems: number;
  subtotal: number;
  deliveryFee: number;
  /** Zone whose fee is shown (signed-in customer's default address); null → store default. */
  deliveryZone: PricedCart['deliveryZone'] | null;
  /** Automatic deals the server applied to this cart (part of `discount`). */
  appliedPromotions: NonNullable<PricedCart['appliedPromotions']>;
  discount: number;
  total: number;
  freeDeliveryThreshold: number;
  freeDeliveryProgress: number;
  /** A coupon the customer entered; validated by the server, applied at checkout. */
  couponCode: string | null;
  applyCoupon: (code: string) => Promise<boolean>;
  removeCoupon: () => void;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  toggleCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);
const COUPON_KEY = 'ragab_coupon';

/** A line is (product, variant); no variant given ⇒ the product's default unit. */
function sameLine(l: CartItem, productId: string, variantId?: string): boolean {
  if (l.product.id !== productId) return false;
  if (variantId) return l.variantId === variantId;
  return l.variant ? l.variant.isDefault : !l.variantId || l.variantId === l.product.defaultVariantId;
}

const EMPTY: PricedCart = {
  items: [], totalItems: 0, subtotal: 0, deliveryFee: 0, discount: 0, tax: 0, total: 0,
  freeDeliveryThreshold: 0, freeDeliveryProgress: 0, currency: 'EGP',
};

/**
 * The server is the single source of truth for the cart (the mobile app reads the very
 * same one). This context is a thin, optimistic cache of the server's priced cart:
 * mutations update the line list immediately, then are replaced by the server's answer;
 * a failure rolls back and is surfaced. Nothing here computes money.
 */
export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { isRTL } = useLanguage();
  const { showToast } = useToast();
  const [priced, setPriced] = useState<PricedCart>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [inFlight, setInFlight] = useState(0);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponFreeDelivery, setCouponFreeDelivery] = useState(false);
  // Out-of-order protection: only the latest request may write the cart.
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const fresh = await cartService.get();
      if (mine === seq.current) setPriced(fresh);
    } catch {
      /* keep whatever we have; the next mutation will resync */
    } finally {
      if (mine === seq.current) setIsLoading(false);
    }
  }, []);

  // Load on mount and whenever the signed-in user changes (sign-in merges the guest cart
  // server-side; sign-out drops back to the anonymous cart).
  useEffect(() => {
    void refresh();
  }, [refresh, user?.id]);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(COUPON_KEY);
      if (saved) setCouponCode(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const fail = useCallback(
    (e: unknown) => {
      const message = e instanceof ApiError ? (isRTL ? e.bilingual.ar : e.bilingual.en) : isRTL ? 'تعذّر تحديث السلة.' : 'Could not update the cart.';
      showToast(message, 'error');
    },
    [isRTL, showToast],
  );

  /** Apply `optimistic` to the line list now, then commit `op` and adopt its answer. */
  const mutate = useCallback(
    async (optimistic: (items: CartItem[]) => CartItem[], op: () => Promise<PricedCart>) => {
      const mine = ++seq.current;
      const previous = priced;
      setPriced((p) => {
        const items = optimistic(p.items);
        return { ...p, items, totalItems: items.reduce((n, l) => n + l.quantity, 0) };
      });
      setInFlight((n) => n + 1);
      try {
        const fresh = await op();
        if (mine === seq.current) setPriced(fresh);
      } catch (e) {
        if (mine === seq.current) setPriced(previous);
        fail(e);
        throw e;
      } finally {
        setInFlight((n) => n - 1);
      }
    },
    [priced, fail],
  );

  const addToCart = useCallback(
    (product: Product, quantity = 1, variantId?: string) => {
      const vid = variantId ?? product.defaultVariantId;
      const v = product.variants?.find((x) => x.id === vid);
      return mutate(
        (items) => {
          const existing = items.find((l) => sameLine(l, product.id, vid));
          return existing
            ? items.map((l) => (sameLine(l, product.id, vid) ? { ...l, quantity: l.quantity + quantity } : l))
            : [
                ...items,
                {
                  product,
                  quantity,
                  variantId: vid,
                  variant: v ? { id: v.id, nameAr: v.nameAr, nameEn: v.nameEn, unitAr: v.unitAr, unitEn: v.unitEn, price: v.price, isDefault: v.isDefault } : undefined,
                  unitPrice: v?.price ?? product.price,
                },
              ];
        },
        () => cartService.add(product.id, quantity, variantId),
      ).catch(() => undefined);
    },
    [mutate],
  );

  const removeFromCart = useCallback(
    (productId: string, variantId?: string) =>
      mutate((items) => items.filter((l) => !sameLine(l, productId, variantId)), () => cartService.remove(productId, variantId)).catch(() => undefined),
    [mutate],
  );

  const updateQuantity = useCallback(
    (productId: string, quantity: number, variantId?: string) => {
      if (quantity <= 0) return removeFromCart(productId, variantId);
      return mutate(
        (items) => items.map((l) => (sameLine(l, productId, variantId) ? { ...l, quantity } : l)),
        () => cartService.setQuantity(productId, quantity, variantId),
      ).catch(() => undefined);
    },
    [mutate, removeFromCart],
  );

  const itemsRef = useRef(priced.items);
  itemsRef.current = priced.items;
  const lineFor = useCallback((productId: string, variantId?: string) => itemsRef.current.find((l) => sameLine(l, productId, variantId)), []);

  const clearCart = useCallback(() => mutate(() => [], () => cartService.clear()).catch(() => undefined), [mutate]);

  const applyCoupon = useCallback(
    async (code: string) => {
      try {
        const preview = await cartService.validateCoupon(code, priced.subtotal);
        setCouponCode(preview.code);
        setCouponDiscount(preview.discount);
        setCouponFreeDelivery(preview.freeDelivery);
        try { sessionStorage.setItem(COUPON_KEY, preview.code); } catch { /* ignore */ }
        return true;
      } catch (e) {
        setCouponCode(null);
        setCouponDiscount(0);
        setCouponFreeDelivery(false);
        fail(e);
        return false;
      }
    },
    [priced.subtotal, fail],
  );

  const removeCoupon = useCallback(() => {
    setCouponCode(null);
    setCouponDiscount(0);
    setCouponFreeDelivery(false);
    try { sessionStorage.removeItem(COUPON_KEY); } catch { /* ignore */ }
  }, []);

  // A remembered coupon is re-validated against the live subtotal so the preview is never stale.
  useEffect(() => {
    if (!couponCode || isLoading) return;
    if (priced.items.length === 0) { setCouponDiscount(0); return; }
    let alive = true;
    cartService.validateCoupon(couponCode, priced.subtotal)
      .then((p) => { if (alive) { setCouponDiscount(p.discount); setCouponFreeDelivery(p.freeDelivery); } })
      .catch(() => { if (alive) { setCouponCode(null); setCouponDiscount(0); setCouponFreeDelivery(false); } });
    return () => { alive = false; };
  }, [couponCode, priced.subtotal, priced.items.length, isLoading]);

  const value = useMemo<CartContextType>(() => {
    const deliveryFee = couponFreeDelivery ? 0 : priced.deliveryFee;
    // Automatic deals (server) + the previewed code (server too) — never more than the goods.
    const discount = Math.min(priced.discount + couponDiscount, priced.subtotal);
    return {
      cart: priced.items,
      isLoading,
      isSyncing: inFlight > 0,
      addToCart,
      removeFromCart,
      updateQuantity,
      lineFor,
      clearCart,
      refresh,
      totalItems: priced.totalItems,
      subtotal: priced.subtotal,
      deliveryFee,
      deliveryZone: priced.deliveryZone ?? null,
      appliedPromotions: priced.appliedPromotions ?? [],
      discount,
      total: Math.max(0, priced.subtotal - discount) + deliveryFee + priced.tax,
      freeDeliveryThreshold: priced.freeDeliveryThreshold,
      freeDeliveryProgress: priced.freeDeliveryProgress,
      couponCode,
      applyCoupon,
      removeCoupon,
      isCartOpen,
      setIsCartOpen,
      toggleCart: () => setIsCartOpen((o) => !o),
    };
  }, [priced, isLoading, inFlight, addToCart, removeFromCart, updateQuantity, lineFor, clearCart, refresh, couponCode, couponDiscount, couponFreeDelivery, applyCoupon, removeCoupon, isCartOpen]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
};
