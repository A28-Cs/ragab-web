/**
 * Cart — backed by the API (`/api/v1/cart`). The server owns the cart: it is the same
 * cart the mobile app reads, guests get one via the `ragab_cart` cookie, and it is
 * merged into the account on sign-in. Every mutation returns the fully repriced cart,
 * which the client renders as-is — it never computes a delivery fee or a total itself.
 */
import { CartItem, AppliedPromotion } from '../types';
import { api } from '../lib/apiClient';

/** Server-authoritative priced cart (mirrors @ragab/server PricedCart). */
export interface PricedCart {
  items: CartItem[];
  /** Automatic promotions the server applied (their sum is `discount`). */
  appliedPromotions?: AppliedPromotion[];
  /** Zone whose fee applies (signed-in customer's default address); null → store default fee. */
  deliveryZone?: { id: string; nameAr: string; nameEn: string; estimatedTimeAr: string; estimatedTimeEn: string } | null;
  totalItems: number;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  tax: number;
  total: number;
  freeDeliveryThreshold: number;
  freeDeliveryProgress: number;
  couponCode?: string;
  currency: string;
}

export interface CouponPreview {
  code: string;
  type: 'percentage' | 'fixed' | 'free_delivery';
  valid: true;
  /** Discount the coupon would take off the given subtotal (major units). */
  discount: number;
  freeDelivery: boolean;
}

export interface CheckoutQuote {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  total: number;
  couponCode?: string;
  currency: string;
  itemCount: number;
}

export const cartService = {
  get: () => api.get<PricedCart>('/cart'),
  /** `variantId` optional ⇒ the product's default unit (piece / box / weight are variants). */
  add: (productId: string, quantity = 1, variantId?: string) => api.post<PricedCart>('/cart/items', { productId, quantity, ...(variantId ? { variantId } : {}) }),
  setQuantity: (productId: string, quantity: number, variantId?: string) => api.patch<PricedCart>('/cart/items', { productId, quantity, ...(variantId ? { variantId } : {}) }),
  remove: (productId: string, variantId?: string) =>
    api.del<PricedCart>(`/cart/items/${encodeURIComponent(productId)}${variantId ? `?variantId=${encodeURIComponent(variantId)}` : ''}`),
  clear: () => api.del<PricedCart>('/cart'),
  validateCoupon: (code: string, subtotal: number) => api.post<CouponPreview>('/coupons/validate', { code, subtotal }),
  /** Address-aware totals — the only numbers the checkout page should display. */
  quote: (addressId: string, couponCode?: string) =>
    api.post<CheckoutQuote>('/checkout/quote', { addressId, couponCode: couponCode || undefined }),
};
