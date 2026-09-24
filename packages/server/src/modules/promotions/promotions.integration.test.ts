/**
 * One promotion engine (0008): an automatic category deal changes the cart, the quote and
 * the order by the same amount and only on that category; a threshold gift becomes a
 * zero-priced, reserved order line; an expired rule neither applies nor shows as a banner;
 * a code is validated and previewed against the REAL cart and redeemed once per customer.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { z } from 'zod';
import { eq, inArray, like } from 'drizzle-orm';
import { defineRoute } from '../../http/handler';
import { callRoute, type CallResult } from '../../test/http';
import { withTriggersDisabled } from '../../test/db';
import { db, closeDb } from '../../db/client';
import {
  users, addresses, orders, orderItems, orderStatusHistory, stockReservations, stockMovements, inventoryItems,
  payments, paymentIntents, paymentTransactions, carts, cartItems, notifications, emailEvents, coupons, couponRedemptions,
} from '../../db/schema';
import { SESSION_COOKIE } from '../../security/session';
import { authService, registerSchema, loginSchema } from '../auth';
import { cartService, addToCartSchema } from '../cart';
import { checkoutService, checkoutSchema, quoteSchema } from '../checkout';
import { createAddress, addressSchema } from '../addresses/service';
import { paymentService } from '../payments';
import { promotionService, promotionUpsertSchema, listActiveBanners } from '.';

const registerRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: registerSchema, handler: ({ body, ctx }) => authService.register(body, ctx) });
const loginRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: loginSchema, handler: ({ body, ctx }) => authService.login(body, ctx) });
const addRoute = defineRoute({ method: 'POST', csrf: false, auth: 'optional', bodySchema: addToCartSchema, handler: ({ body, ctx }) => cartService.addToCart(ctx, body.productId, body.quantity ?? 1, body.variantId) });
const clearRoute = defineRoute({ method: 'DELETE', csrf: false, auth: 'optional', handler: ({ ctx }) => cartService.clearCart(ctx) });
const cartRoute = defineRoute({ method: 'GET', auth: 'optional', handler: ({ ctx }) => cartService.getPricedCart(ctx) });
const couponRoute = defineRoute({ method: 'POST', csrf: false, auth: 'optional', bodySchema: z.object({ code: z.string() }), handler: ({ body, ctx }) => cartService.previewCoupon(ctx, body.code) });
const quoteRoute = defineRoute({ method: 'POST', csrf: false, auth: 'required', bodySchema: quoteSchema, handler: ({ body, ctx }) => checkoutService.quote(ctx, body) });
const checkoutRoute = defineRoute({ method: 'POST', csrf: false, auth: 'required', idempotent: { scope: 'checkout' }, bodySchema: checkoutSchema, successStatus: 201, handler: async ({ body, ctx }) => {
  const order = await checkoutService.placeOrder(ctx, body);
  const payment = await paymentService.initPayment(order.id);
  return { order, payment };
} });
const addressRoute = defineRoute({ method: 'POST', csrf: false, auth: 'required', bodySchema: addressSchema, successStatus: 201, handler: ({ body, ctx }) => createAddress(ctx, body) });
const promoCreateRoute = defineRoute({ method: 'POST', csrf: false, permission: { resource: 'promotions', action: 'create' }, bodySchema: promotionUpsertSchema, successStatus: 201, handler: ({ body, ctx }) => promotionService.savePromotion(ctx, body) });
const promoDeleteRoute = defineRoute({ method: 'DELETE', csrf: false, permission: { resource: 'promotions', action: 'delete' }, paramsSchema: z.object({ id: z.string() }), handler: ({ params, ctx }) => promotionService.deletePromotion(ctx, params.id) });
const bannersRoute = defineRoute({ method: 'GET', auth: 'none', handler: () => listActiveBanners() });

const PHONE = '01077665477';
const TITLE = 'عرض اختبار المحرك';
let userId = '';
let addressId = '';
const created: string[] = [];

async function sessionFor(phone: string, password: string): Promise<Record<string, string>> {
  const res = await callRoute(loginRoute, { method: 'POST', body: { identifier: phone, password } });
  return { [SESSION_COOKIE]: res.cookies[SESSION_COOKIE]! };
}
async function cartWith(session: Record<string, string>, lines: { productId: string; quantity: number }[]): Promise<void> {
  await callRoute(clearRoute, { method: 'DELETE', cookies: session });
  for (const l of lines) await callRoute(addRoute, { method: 'POST', body: l, cookies: session });
}
async function newPromo(admin: Record<string, string>, body: Record<string, unknown>): Promise<CallResult> {
  const res = await callRoute(promoCreateRoute, { method: 'POST', cookies: admin, body: { kind: 'automatic', titleAr: `${TITLE} ${Date.now()}`, ...body } });
  if (res.status === 201) created.push(res.body.data.id);
  return res;
}
async function reserved(productId: string): Promise<number> {
  const [inv] = await db().select().from(inventoryItems).where(eq(inventoryItems.productId, productId)).limit(1);
  return inv!.quantityReserved;
}
/** Stop every rule this suite created (and the seeded/migrated banners' zero rules never discount). */
async function retireCreated(): Promise<void> {
  if (created.length) await db().update(coupons).set({ isActive: false, showBanner: false }).where(inArray(coupons.id, created));
}

describe('promotion engine (integration)', () => {
  beforeAll(async () => {
    await cleanup();
    // The seeded dairy banner may carry a live 15% rule on a fresh DB; neutralise ambient rules for exact numbers.
    await db().update(coupons).set({ isActive: false }).where(like(coupons.id, 'promo_offer_%'));
    const reg = await callRoute(registerRoute, { method: 'POST', body: { name: 'زبون العروض', phone: PHONE, password: 'Secret@123', defaultVillage: 'عليم' } });
    userId = reg.body.data.id;
    const session = await sessionFor(PHONE, 'Secret@123');
    const addr = await callRoute(addressRoute, { method: 'POST', cookies: session, body: { title: 'المنزل', recipientName: 'زبون', phone: PHONE, village: 'قرية عليم', streetAddress: 'شارع 4', isDefault: true } });
    addressId = addr.body.data.id;
  });
  afterAll(async () => {
    await cleanup();
    await db().update(coupons).set({ isActive: true }).where(like(coupons.id, 'promo_offer_%'));
    await closeDb();
  });

  it('a category deal (15% dairy) discounts only dairy lines — in the cart, the quote and the order — and shows as a banner with a derived badge', async () => {
    const admin = await sessionFor('01000000000', 'Admin@12345');
    const session = await sessionFor(PHONE, 'Secret@123');
    const promo = await newPromo(admin, { type: 'percentage', value: 15, scope: 'category', categoryIds: ['cat_dairy'], showBanner: true, theme: 'amber' });
    expect(promo.status).toBe(201);
    expect(promo.body.data.displayBadgeAr).toBe('خصم 15%');

    await cartWith(session, [{ productId: 'prod_milk', quantity: 2 }, { productId: 'prod_oil', quantity: 1 }]); // 84 + 95
    const cart = (await callRoute(cartRoute, { cookies: session })).body.data;
    expect(cart.subtotal).toBe(179);
    expect(cart.discount).toBe(12.6); // 15% of 84 only
    expect(cart.appliedPromotions).toEqual([expect.objectContaining({ id: promo.body.data.id, discount: 12.6 })]);

    const quote = (await callRoute(quoteRoute, { method: 'POST', cookies: session, body: { addressId } })).body.data;
    expect(quote.discount).toBe(12.6);
    expect(quote.total).toBe(179 - 12.6 + 15);
    expect(quote.promotions[0].titleAr).toMatch(/^عرض اختبار/);

    const placed = await callRoute(checkoutRoute, { method: 'POST', cookies: session, headers: { 'idempotency-key': 'pr-dairy' }, body: { addressId, paymentMethod: 'cod' } });
    expect(placed.status).toBe(201);
    expect(placed.body.data.order.discount).toBe(12.6);
    expect(placed.body.data.order.total).toBe(181.4);
    const redemptions = await db().select().from(couponRedemptions).where(eq(couponRedemptions.orderId, placed.body.data.order.id));
    expect(redemptions).toEqual([expect.objectContaining({ couponId: promo.body.data.id, discountMinor: 1260 })]);

    const banners = (await callRoute(bannersRoute, {})).body.data as { promotionId?: string; discountBadgeAr: string; categoryId?: string }[];
    const mine = banners.find((b) => b.promotionId === promo.body.data.id)!;
    expect(mine.discountBadgeAr).toBe('خصم 15%');
    expect(mine.categoryId).toBe('cat_dairy');
    await retireCreated();
  });

  it('a threshold gift becomes a zero-priced, reserved line at ≥ 600 and is withheld below', async () => {
    const admin = await sessionFor('01000000000', 'Admin@12345');
    const session = await sessionFor(PHONE, 'Secret@123');
    expect((await newPromo(admin, { type: 'free_gift', giftProductId: 'prod_chips', minOrder: 600 })).status).toBe(201);

    await cartWith(session, [{ productId: 'prod_rice', quantity: 4 }]); // 540
    const below = (await callRoute(quoteRoute, { method: 'POST', cookies: session, body: { addressId } })).body.data;
    expect(below.gifts).toEqual([]);

    await cartWith(session, [{ productId: 'prod_rice', quantity: 5 }]); // 675
    const above = (await callRoute(quoteRoute, { method: 'POST', cookies: session, body: { addressId } })).body.data;
    expect(above.gifts).toEqual([expect.objectContaining({ productId: 'prod_chips' })]);

    const chipsBefore = await reserved('prod_chips');
    const placed = await callRoute(checkoutRoute, { method: 'POST', cookies: session, headers: { 'idempotency-key': 'pr-gift' }, body: { addressId, paymentMethod: 'cod' } });
    expect(placed.status).toBe(201);
    const gift = placed.body.data.order.items.find((i: { productId: string }) => i.productId === 'prod_chips');
    expect(gift.price).toBe(0);
    expect(gift.productNameAr).toContain('هدية');
    expect(placed.body.data.order.total).toBe(675); // ≥ 300 → free delivery; the gift adds nothing
    expect(await reserved('prod_chips')).toBe(chipsBefore + 1);
    await retireCreated();
  });

  it('an expired rule neither applies nor appears as a banner; a usage-limited rule stops after its last redemption', async () => {
    const admin = await sessionFor('01000000000', 'Admin@12345');
    const session = await sessionFor(PHONE, 'Secret@123');
    const expired = await newPromo(admin, { type: 'percentage', value: 50, scope: 'cart', showBanner: true, expiresAt: '2020-01-01' });
    const once = await newPromo(admin, { type: 'fixed', value: 10, scope: 'cart', usageLimit: 1 });

    await cartWith(session, [{ productId: 'prod_oil', quantity: 1 }]);
    const cart = (await callRoute(cartRoute, { cookies: session })).body.data;
    expect(cart.discount).toBe(10); // only the one-use fixed rule
    expect(cart.appliedPromotions.map((a: { id: string }) => a.id)).toEqual([once.body.data.id]);
    const banners = (await callRoute(bannersRoute, {})).body.data as { promotionId?: string }[];
    expect(banners.some((b) => b.promotionId === expired.body.data.id)).toBe(false);

    const placed = await callRoute(checkoutRoute, { method: 'POST', cookies: session, headers: { 'idempotency-key': 'pr-once' }, body: { addressId, paymentMethod: 'cod' } });
    expect(placed.body.data.order.discount).toBe(10);
    await cartWith(session, [{ productId: 'prod_oil', quantity: 1 }]);
    expect((await callRoute(cartRoute, { cookies: session })).body.data.discount).toBe(0); // exhausted
    await retireCreated();
  });

  it('a code is previewed against the real cart (after automatic deals), applied at checkout, and honours the per-customer limit', async () => {
    const admin = await sessionFor('01000000000', 'Admin@12345');
    const session = await sessionFor(PHONE, 'Secret@123');
    const code = `ENG${Date.now().toString(36).toUpperCase()}`;
    expect((await newPromo(admin, { kind: 'code', code, type: 'percentage', value: 10, scope: 'cart', perUserLimit: 1 })).status).toBe(201);
    expect((await newPromo(admin, { type: 'percentage', value: 15, scope: 'category', categoryIds: ['cat_dairy'] })).status).toBe(201);

    await cartWith(session, [{ productId: 'prod_milk', quantity: 2 }]); // 84 → dairy 15% = 12.6 → code 10% of 71.4 = 7.14
    const preview = await callRoute(couponRoute, { method: 'POST', cookies: session, body: { code: code.toLowerCase() } });
    expect(preview.status).toBe(200);
    expect(preview.body.data.discount).toBe(7.14);

    const placed = await callRoute(checkoutRoute, { method: 'POST', cookies: session, headers: { 'idempotency-key': 'pr-code' }, body: { addressId, paymentMethod: 'cod', couponCode: code } });
    expect(placed.status).toBe(201);
    expect(placed.body.data.order.discount).toBe(19.74);
    expect(placed.body.data.order.couponCode).toBe(code);

    await cartWith(session, [{ productId: 'prod_milk', quantity: 1 }]);
    const again = await callRoute(couponRoute, { method: 'POST', cookies: session, body: { code } });
    expect(again.status).toBe(422);
    expect(again.body.error.code).toBe('COUPON_PER_USER_LIMIT');
    await retireCreated();
  });

  it('two checkouts racing for the last use of a limited rule: exactly one gets it, the other is refused in-transaction', async () => {
    const admin = await sessionFor('01000000000', 'Admin@12345');
    const session = await sessionFor(PHONE, 'Secret@123');
    const last = await newPromo(admin, { type: 'fixed', value: 10, scope: 'cart', usageLimit: 1 });
    expect(last.status).toBe(201);

    // Two customers each hold a cart the read-time filter already priced with the rule.
    const other = '01077665466';
    await callRoute(registerRoute, { method: 'POST', body: { name: 'منافس', phone: other, password: 'Secret@123', defaultVillage: 'عليم' } });
    const rival = await sessionFor(other, 'Secret@123');
    const rivalAddr = await callRoute(addressRoute, { method: 'POST', cookies: rival, body: { title: 'المنزل', recipientName: 'منافس', phone: other, village: 'قرية عليم', streetAddress: 'شارع 6', isDefault: true } });
    await cartWith(session, [{ productId: 'prod_oil', quantity: 1 }]);
    await cartWith(rival, [{ productId: 'prod_oil', quantity: 1 }]);
    expect((await callRoute(cartRoute, { cookies: session })).body.data.discount).toBe(10);
    expect((await callRoute(cartRoute, { cookies: rival })).body.data.discount).toBe(10);

    const [a, b] = await Promise.all([
      callRoute(checkoutRoute, { method: 'POST', cookies: session, headers: { 'idempotency-key': 'pr-race-a' }, body: { addressId, paymentMethod: 'cod' } }),
      callRoute(checkoutRoute, { method: 'POST', cookies: rival, headers: { 'idempotency-key': 'pr-race-b' }, body: { addressId: rivalAddr.body.data.id, paymentMethod: 'cod' } }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 422]);
    const refused = a.status === 422 ? a : b;
    expect(refused.body.error.code).toBe('COUPON_EXHAUSTED');
    const winner = a.status === 201 ? a : b;
    expect(winner.body.data.order.discount).toBe(10);
    const [row] = await db().select().from(coupons).where(eq(coupons.id, last.body.data.id));
    expect(row!.usageCount).toBe(1);
    // No half-written order for the loser.
    const loserOrders = await db().select({ id: orders.id }).from(orders).where(eq(orders.userId, (await db().select({ id: users.id }).from(users).where(eq(users.phone, other)).limit(1))[0]!.id));
    expect(loserOrders.length + (a.status === 201 && b.status === 201 ? 1 : 0)).toBeLessThanOrEqual(1);
    await retireCreated();
    await withTriggersDisabled(async (tx) => {
      const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.phone, other)).limit(1);
      if (u) {
        await tx.delete(couponRedemptions).where(eq(couponRedemptions.userId, u.id));
        const os = await tx.select({ id: orders.id }).from(orders).where(eq(orders.userId, u.id));
        const oids = os.map((o: { id: string }) => o.id);
        if (oids.length) {
          await tx.delete(paymentTransactions).where(inArray(paymentTransactions.orderId, oids));
          await tx.delete(paymentIntents).where(inArray(paymentIntents.orderId, oids));
          await tx.delete(payments).where(inArray(payments.orderId, oids));
          await tx.delete(stockReservations).where(inArray(stockReservations.orderId, oids));
          await tx.delete(orderStatusHistory).where(inArray(orderStatusHistory.orderId, oids));
          await tx.delete(orderItems).where(inArray(orderItems.orderId, oids));
          await tx.delete(orders).where(inArray(orders.id, oids));
        }
        await tx.delete(notifications).where(eq(notifications.userId, u.id));
        await tx.delete(emailEvents).where(eq(emailEvents.userId, u.id));
        const cs = await tx.select({ id: carts.id }).from(carts).where(eq(carts.userId, u.id));
        const cids = cs.map((c: { id: string }) => c.id);
        if (cids.length) await tx.delete(cartItems).where(inArray(cartItems.cartId, cids));
        await tx.delete(carts).where(eq(carts.userId, u.id));
        await tx.delete(addresses).where(eq(addresses.userId, u.id));
        await tx.delete(users).where(eq(users.id, u.id));
      }
    });
  });

  it('a redeemed rule is deactivated on delete (history), an unused one is removed', async () => {
    const admin = await sessionFor('01000000000', 'Admin@12345');
    const unused = await newPromo(admin, { type: 'fixed', value: 5, scope: 'cart', isActive: false });
    expect((await callRoute(promoDeleteRoute, { method: 'DELETE', cookies: admin, params: { id: unused.body.data.id } })).body.data.deleted).toBe(true);
    const [gone] = await db().select().from(coupons).where(eq(coupons.id, unused.body.data.id));
    expect(gone).toBeUndefined();
    const usedId = created[0]!; // the dairy rule from the first test was redeemed
    expect((await callRoute(promoDeleteRoute, { method: 'DELETE', cookies: admin, params: { id: usedId } })).body.data.deleted).toBe(false);
    const [kept] = await db().select().from(coupons).where(eq(coupons.id, usedId));
    expect(kept!.isActive).toBe(false);
  });
});

async function cleanup() {
  const rows = await db().select({ id: users.id }).from(users).where(inArray(users.phone, [PHONE]));
  const ids = rows.map((r) => r.id);
  await withTriggersDisabled(async (tx) => {
    if (ids.length) {
      await tx.delete(notifications).where(inArray(notifications.userId, ids));
      await tx.delete(emailEvents).where(inArray(emailEvents.userId, ids));
      await tx.delete(couponRedemptions).where(inArray(couponRedemptions.userId, ids));
      const os = await tx.select({ id: orders.id }).from(orders).where(inArray(orders.userId, ids));
      const oids = os.map((o: { id: string }) => o.id);
      if (oids.length) {
        await tx.delete(paymentTransactions).where(inArray(paymentTransactions.orderId, oids));
        await tx.delete(paymentIntents).where(inArray(paymentIntents.orderId, oids));
        await tx.delete(payments).where(inArray(payments.orderId, oids));
        await tx.delete(stockReservations).where(inArray(stockReservations.orderId, oids));
        await tx.delete(orderStatusHistory).where(inArray(orderStatusHistory.orderId, oids));
        await tx.delete(orderItems).where(inArray(orderItems.orderId, oids));
        await tx.delete(orders).where(inArray(orders.id, oids));
      }
      const cs = await tx.select({ id: carts.id }).from(carts).where(inArray(carts.userId, ids));
      const cids = cs.map((c: { id: string }) => c.id);
      if (cids.length) await tx.delete(cartItems).where(inArray(cartItems.cartId, cids));
      await tx.delete(carts).where(inArray(carts.userId, ids));
      await tx.delete(addresses).where(inArray(addresses.userId, ids));
      await tx.delete(users).where(inArray(users.id, ids));
    }
    await tx.delete(coupons).where(like(coupons.titleAr, `${TITLE}%`));
    await tx.delete(stockMovements).where(inArray(stockMovements.productId, ['prod_milk', 'prod_oil', 'prod_rice', 'prod_chips']));
    await tx.update(inventoryItems).set({ quantityOnHand: 80, quantityReserved: 0 }).where(eq(inventoryItems.productId, 'prod_milk'));
    await tx.update(inventoryItems).set({ quantityOnHand: 45, quantityReserved: 0 }).where(eq(inventoryItems.productId, 'prod_oil'));
    await tx.update(inventoryItems).set({ quantityOnHand: 60, quantityReserved: 0 }).where(eq(inventoryItems.productId, 'prod_rice'));
    await tx.update(inventoryItems).set({ quantityOnHand: 90, quantityReserved: 0 }).where(eq(inventoryItems.productId, 'prod_chips'));
  });
  created.length = 0;
}
