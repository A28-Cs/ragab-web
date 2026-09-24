import { describe, it, expect } from 'vitest';
import { computeTotals, type PromotionSpec } from './engine';

const line = (unitPriceMinor: number, quantity: number, extra: { productId?: string; categoryId?: string } = {}) => ({
  productId: extra.productId ?? 'p',
  quantity,
  unitPriceMinor,
  categoryId: extra.categoryId,
});

const promo = (over: Partial<PromotionSpec>): PromotionSpec => ({
  id: over.id ?? 'promo',
  kind: 'automatic',
  type: 'percentage',
  value: 0,
  minOrderMinor: 0,
  scope: 'cart',
  ...over,
});

describe('pricing engine', () => {
  const base = { deliveryFeeMinor: 1500, freeDeliveryThresholdMinor: 30000 };

  it('sums line totals into subtotal', () => {
    const t = computeTotals({ ...base, lines: [line(9500, 2), line(4200, 1)] });
    expect(t.subtotalMinor).toBe(9500 * 2 + 4200);
  });

  it('charges delivery below the free threshold', () => {
    const t = computeTotals({ ...base, lines: [line(5000, 1)] });
    expect(t.deliveryFeeMinor).toBe(1500);
    expect(t.totalMinor).toBe(5000 + 1500);
  });

  it('waives delivery at/above the free threshold', () => {
    const t = computeTotals({ ...base, lines: [line(30000, 1)] });
    expect(t.deliveryFeeMinor).toBe(0);
    expect(t.totalMinor).toBe(30000);
  });

  it('applies a percentage coupon (bps) and re-evaluates free delivery on the discounted subtotal', () => {
    // subtotal 32000, 10% off => 3200 discount => discounted 28800 < 30000 => delivery charged
    const t = computeTotals({ ...base, lines: [line(32000, 1)], coupon: { code: 'X', type: 'percentage', value: 1000 } });
    expect(t.discountMinor).toBe(3200);
    expect(t.deliveryFeeMinor).toBe(1500);
    expect(t.totalMinor).toBe(28800 + 1500);
    expect(t.applied).toEqual([expect.objectContaining({ code: 'X', discountMinor: 3200 })]);
  });

  it('caps a percentage coupon at maxDiscount', () => {
    const t = computeTotals({ ...base, lines: [line(100000, 1)], coupon: { code: 'X', type: 'percentage', value: 5000, maxDiscountMinor: 2000 } });
    expect(t.discountMinor).toBe(2000);
  });

  it('never lets a fixed coupon exceed the subtotal', () => {
    const t = computeTotals({ ...base, lines: [line(3000, 1)], coupon: { code: 'X', type: 'fixed', value: 999999 } });
    expect(t.discountMinor).toBe(3000);
    expect(t.deliveryFeeMinor).toBe(0); // discounted subtotal is 0 -> delivery waived
    expect(t.totalMinor).toBe(0);
  });

  it('free_delivery coupon zeroes delivery only', () => {
    const t = computeTotals({ ...base, lines: [line(5000, 1)], coupon: { code: 'FREE', type: 'free_delivery', value: 0 } });
    expect(t.discountMinor).toBe(0);
    expect(t.deliveryFeeMinor).toBe(0);
    expect(t.totalMinor).toBe(5000);
  });

  it('adds exclusive VAT on the discounted amount', () => {
    const t = computeTotals({ ...base, lines: [line(10000, 1)], tax: { rateBps: 1400, inclusive: false } });
    expect(t.taxMinor).toBe(1400); // 14% of 10000
    expect(t.totalMinor).toBe(10000 + 1500 + 1400);
  });

  it('empty cart totals to zero with no delivery', () => {
    const t = computeTotals({ ...base, lines: [] });
    expect(t).toEqual({ subtotalMinor: 0, discountMinor: 0, deliveryFeeMinor: 0, taxMinor: 0, totalMinor: 0, applied: [], giftProductIds: [] });
  });

  describe('promotion rules (0008)', () => {
    const dairy15 = promo({ id: 'dairy', type: 'percentage', value: 1500, scope: 'category', categoryIds: ['cat_dairy'], titleAr: 'خصم الألبان' });

    it('a category rule discounts ONLY that category’s lines', () => {
      const t = computeTotals({ ...base, lines: [line(4200, 2, { productId: 'milk', categoryId: 'cat_dairy' }), line(9500, 1, { productId: 'oil', categoryId: 'cat_groceries' })], promotions: [dairy15] });
      expect(t.discountMinor).toBe(1260); // 15% of 8400
      expect(t.applied).toEqual([expect.objectContaining({ id: 'dairy', discountMinor: 1260, titleAr: 'خصم الألبان' })]);
      expect(t.totalMinor).toBe(8400 + 9500 - 1260 + 1500);
    });

    it('a product rule (fixed) targets the listed products and is capped by the line remainder', () => {
      const t = computeTotals({ ...base, lines: [line(1500, 1, { productId: 'chips' }), line(9500, 1, { productId: 'oil' })], promotions: [promo({ id: 'chips-deal', type: 'fixed', value: 5000, scope: 'product', productIds: ['chips'] })] });
      expect(t.discountMinor).toBe(1500); // never more than the chips line itself
    });

    it('stacks deterministically: product → category → cart, each on what is LEFT', () => {
      const lines = [line(10000, 1, { productId: 'milk', categoryId: 'cat_dairy' })];
      const t = computeTotals({
        ...base,
        lines,
        promotions: [
          promo({ id: 'cart10', type: 'percentage', value: 1000, scope: 'cart' }), // listed first, applied last
          dairy15,
        ],
      });
      // 15% of 10000 = 1500, then 10% of the remaining 8500 = 850 — not 10% of 10000.
      expect(t.applied.map((a) => a.id)).toEqual(['dairy', 'cart10']);
      expect(t.discountMinor).toBe(1500 + 850);
    });

    it('a threshold gift is granted at/above the minimum and withheld below it', () => {
      const gift = promo({ id: 'gift600', type: 'free_gift', minOrderMinor: 60000, giftProductId: 'chips' });
      expect(computeTotals({ ...base, lines: [line(13500, 5)], promotions: [gift] }).giftProductIds).toEqual(['chips']); // 675
      expect(computeTotals({ ...base, lines: [line(13500, 4)], promotions: [gift] }).giftProductIds).toEqual([]); // 540
    });

    it('a free-delivery rule waives the fee and reports itself', () => {
      const t = computeTotals({ ...base, lines: [line(5000, 1)], promotions: [promo({ id: 'ship', type: 'free_delivery' })] });
      expect(t.deliveryFeeMinor).toBe(0);
      expect(t.applied).toEqual([expect.objectContaining({ id: 'ship', freeDelivery: true, discountMinor: 0 })]);
    });

    it('ignores rules whose threshold the raw subtotal does not reach, and rules with nothing eligible', () => {
      const t = computeTotals({
        ...base,
        lines: [line(5000, 1, { productId: 'oil', categoryId: 'cat_groceries' })],
        promotions: [promo({ id: 'big', type: 'percentage', value: 5000, minOrderMinor: 100000 }), dairy15],
      });
      expect(t.discountMinor).toBe(0);
      expect(t.applied).toEqual([]);
    });

    it('a code behaves like any other rule in the same list (an entered code plus an automatic deal)', () => {
      const t = computeTotals({
        ...base,
        lines: [line(4200, 2, { productId: 'milk', categoryId: 'cat_dairy' })],
        promotions: [dairy15, promo({ id: 'WELCOME', kind: 'code', code: 'WELCOME10', type: 'percentage', value: 1000 })],
      });
      // 15% of 8400 = 1260; then 10% of 7140 = 714
      expect(t.discountMinor).toBe(1260 + 714);
      expect(t.applied.find((a) => a.code === 'WELCOME10')?.discountMinor).toBe(714);
    });
  });
});
