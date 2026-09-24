/**
 * Pricing engine (§8, §28). PURE functions over integer minor units — the single
 * source of truth for every total in the system. Cart, quote and checkout all call
 * this, so the number the customer sees, the number quoted, and the number charged
 * are computed by the SAME code. No client-supplied money is ever trusted (§8).
 *
 * Promotions (migration 0008 — one rules engine for offers + coupons) are applied in a
 * deterministic order: product-scoped → category-scoped → cart-scoped. Each promotion
 * discounts what is LEFT of its eligible lines after earlier promotions (a 15% category
 * deal and a later 10% cart code never double-count the same piastre), is capped by its
 * `maxDiscountMinor`, and requires the raw subtotal to reach `minOrderMinor`.
 *
 * Order of operations:
 *   subtotal  = Σ lineTotal
 *   discount  = Σ promotion discounts (as above; never above the subtotal)
 *   delivery  = 0 if a free-delivery promotion applied, nothing is payable, or
 *               (subtotal - discount) ≥ freeThreshold; else the zone/base fee
 *   tax       = exclusive ? round((subtotal - discount) * rateBps/10000) : 0
 *   total     = subtotal - discount + delivery + tax   (never negative)
 */

export interface PriceLine {
  productId: string;
  quantity: number;
  unitPriceMinor: number;
  /** Needed for category-scoped promotions; lines without it only match product/cart scope. */
  categoryId?: string;
  variantId?: string;
}

/** Legacy shape of an entered code — still accepted; converted into a cart-scoped promotion. */
export interface CouponSpec {
  code: string;
  type: 'percentage' | 'fixed' | 'free_delivery';
  /** percentage: basis points (1000 = 10%); fixed: minor units. */
  value: number;
  maxDiscountMinor?: number | null;
}

export type PromotionType = 'percentage' | 'fixed' | 'free_delivery' | 'free_gift';
export type PromotionScope = 'cart' | 'category' | 'product';

export interface PromotionSpec {
  id: string;
  code?: string | null;
  kind: 'automatic' | 'code';
  type: PromotionType;
  /** percentage: basis points; fixed: minor units; otherwise ignored. */
  value: number;
  maxDiscountMinor?: number | null;
  /** Threshold on the RAW subtotal («إذا اشترى بأكثر من 600 ج.م»). */
  minOrderMinor: number;
  scope: PromotionScope;
  productIds?: string[];
  categoryIds?: string[];
  giftProductId?: string | null;
  titleAr?: string;
  titleEn?: string;
}

export interface AppliedPromotion {
  id: string;
  code?: string | null;
  type: PromotionType;
  discountMinor: number;
  freeDelivery: boolean;
  giftProductId?: string | null;
  titleAr?: string;
  titleEn?: string;
}

export interface PricingInputs {
  lines: PriceLine[];
  deliveryFeeMinor: number;
  freeDeliveryThresholdMinor: number;
  /** Legacy single code; equivalent to one cart-scoped `promotions` entry. */
  coupon?: CouponSpec | null;
  promotions?: PromotionSpec[];
  tax?: { rateBps: number; inclusive: boolean } | null;
}

export interface PricedTotals {
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  taxMinor: number;
  totalMinor: number;
  /** Every promotion that changed the price (or granted delivery / a gift), in application order. */
  applied: AppliedPromotion[];
  /** Products to add at zero price (free_gift promotions whose threshold was met). */
  giftProductIds: string[];
}

const SCOPE_ORDER: Record<PromotionScope, number> = { product: 0, category: 1, cart: 2 };

function couponAsPromotion(c: CouponSpec): PromotionSpec {
  return { id: `code:${c.code}`, code: c.code, kind: 'code', type: c.type, value: c.value, maxDiscountMinor: c.maxDiscountMinor, minOrderMinor: 0, scope: 'cart' };
}

function eligibleLines(promo: PromotionSpec, lines: PriceLine[]): number[] {
  const idx: number[] = [];
  lines.forEach((l, i) => {
    if (promo.scope === 'cart') idx.push(i);
    else if (promo.scope === 'product' && promo.productIds?.includes(l.productId)) idx.push(i);
    else if (promo.scope === 'category' && l.categoryId && promo.categoryIds?.includes(l.categoryId)) idx.push(i);
  });
  return idx;
}

/**
 * Spread `amount` over the eligible lines proportionally to what is left of each, so a
 * later cart-wide promotion sees the remainder. Rounding residue lands on the largest line.
 */
function allocate(amount: number, idx: number[], remaining: number[]): void {
  const base = idx.reduce((s, i) => s + remaining[i]!, 0);
  if (base <= 0 || amount <= 0) return;
  let left = amount;
  let largest = idx[0]!;
  for (const i of idx) {
    if (remaining[i]! > remaining[largest]!) largest = i;
    const share = Math.floor((amount * remaining[i]!) / base);
    remaining[i] = remaining[i]! - share;
    left -= share;
  }
  remaining[largest] = Math.max(0, remaining[largest]! - left);
}

export function computeTotals(input: PricingInputs): PricedTotals {
  const lines = input.lines.filter((l) => l.quantity > 0);
  const lineTotals = lines.map((l) => l.unitPriceMinor * l.quantity);
  const subtotal = lineTotals.reduce((s, v) => s + v, 0);

  // ---- promotions: product → category → cart, stable within a scope ----
  const promos = [...(input.promotions ?? []), ...(input.coupon ? [couponAsPromotion(input.coupon)] : [])]
    .map((p, i) => ({ p, i }))
    .sort((a, b) => SCOPE_ORDER[a.p.scope] - SCOPE_ORDER[b.p.scope] || a.i - b.i)
    .map((x) => x.p);

  const remaining = [...lineTotals];
  const applied: AppliedPromotion[] = [];
  const giftProductIds: string[] = [];
  let discount = 0;
  let freeDelivery = false;

  for (const promo of promos) {
    if (subtotal < promo.minOrderMinor) continue;
    if (promo.type === 'free_delivery') {
      freeDelivery = true;
      applied.push({ id: promo.id, code: promo.code, type: promo.type, discountMinor: 0, freeDelivery: true, titleAr: promo.titleAr, titleEn: promo.titleEn });
      continue;
    }
    if (promo.type === 'free_gift') {
      if (!promo.giftProductId) continue;
      giftProductIds.push(promo.giftProductId);
      applied.push({ id: promo.id, code: promo.code, type: promo.type, discountMinor: 0, freeDelivery: false, giftProductId: promo.giftProductId, titleAr: promo.titleAr, titleEn: promo.titleEn });
      continue;
    }
    const idx = eligibleLines(promo, lines);
    const base = idx.reduce((s, i) => s + remaining[i]!, 0);
    if (base <= 0) continue;
    let d = promo.type === 'percentage' ? Math.round((base * promo.value) / 10000) : promo.value;
    if (promo.maxDiscountMinor != null) d = Math.min(d, promo.maxDiscountMinor);
    d = Math.max(0, Math.min(d, base));
    if (d === 0) continue;
    allocate(d, idx, remaining);
    discount += d;
    applied.push({ id: promo.id, code: promo.code, type: promo.type, discountMinor: d, freeDelivery: false, titleAr: promo.titleAr, titleEn: promo.titleEn });
  }
  discount = Math.min(discount, subtotal);
  const discounted = Math.max(0, subtotal - discount);

  // ---- delivery ----
  const delivery =
    freeDelivery || discounted === 0 || discounted >= input.freeDeliveryThresholdMinor ? 0 : input.deliveryFeeMinor;

  // ---- tax ----
  const tax = input.tax && !input.tax.inclusive && input.tax.rateBps > 0 ? Math.round((discounted * input.tax.rateBps) / 10000) : 0;

  return {
    subtotalMinor: subtotal,
    discountMinor: discount,
    deliveryFeeMinor: delivery,
    taxMinor: tax,
    totalMinor: discounted + delivery + tax,
    applied,
    giftProductIds,
  };
}
