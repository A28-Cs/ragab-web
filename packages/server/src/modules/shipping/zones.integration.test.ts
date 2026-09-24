/**
 * Delivery zones as the pricing source (AC-14): the fee the customer sees in the cart, the
 * quote, the order and its snapshot is the fee of the address's zone; admin edits apply on
 * the next request; zone minimum orders are enforced; a zone that stops being served blocks
 * checkout at that address with a clear rule instead of a silently different fee.
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
  payments, paymentIntents, paymentTransactions, carts, cartItems, notifications, emailEvents, deliveryZones,
} from '../../db/schema';
import { SESSION_COOKIE } from '../../security/session';
import { authService, registerSchema, loginSchema } from '../auth';
import { cartService, addToCartSchema } from '../cart';
import { checkoutService, checkoutSchema, quoteSchema } from '../checkout';
import { createAddress, addressSchema } from '../addresses/service';
import { paymentService } from '../payments';
import { shippingService, deliveryZoneUpsertSchema, deliveryZonePatchSchema } from '.';

const registerRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: registerSchema, handler: ({ body, ctx }) => authService.register(body, ctx) });
const loginRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: loginSchema, handler: ({ body, ctx }) => authService.login(body, ctx) });
const addRoute = defineRoute({ method: 'POST', csrf: false, auth: 'optional', bodySchema: addToCartSchema, handler: ({ body, ctx }) => cartService.addToCart(ctx, body.productId, body.quantity ?? 1) });
const clearRoute = defineRoute({ method: 'DELETE', csrf: false, auth: 'optional', handler: ({ ctx }) => cartService.clearCart(ctx) });
const cartRoute = defineRoute({ method: 'GET', auth: 'optional', handler: ({ ctx }) => cartService.getPricedCart(ctx) });
const quoteRoute = defineRoute({ method: 'POST', csrf: false, auth: 'required', bodySchema: quoteSchema, handler: ({ body, ctx }) => checkoutService.quote(ctx, body) });
const checkoutRoute = defineRoute({ method: 'POST', csrf: false, auth: 'required', idempotent: { scope: 'checkout' }, bodySchema: checkoutSchema, successStatus: 201, handler: async ({ body, ctx }) => {
  const order = await checkoutService.placeOrder(ctx, body);
  const payment = await paymentService.initPayment(order.id);
  return { order, payment };
} });
const addressRoute = defineRoute({ method: 'POST', csrf: false, auth: 'required', bodySchema: addressSchema, successStatus: 201, handler: ({ body, ctx }) => createAddress(ctx, body) });
const zonesPublicRoute = defineRoute({ method: 'GET', auth: 'none', handler: () => shippingService.listDeliveryZones() });
const zonesAdminRoute = defineRoute({ method: 'GET', permission: { resource: 'settings', action: 'view' }, handler: () => shippingService.listZonesAdmin() });
const zoneCreateRoute = defineRoute({ method: 'POST', csrf: false, permission: { resource: 'settings', action: 'edit' }, bodySchema: deliveryZoneUpsertSchema, successStatus: 201, handler: ({ body, ctx }) => shippingService.createZone(ctx, body) });
const zonePatchRoute = defineRoute({ method: 'PATCH', csrf: false, permission: { resource: 'settings', action: 'edit' }, paramsSchema: z.object({ id: z.string() }), bodySchema: deliveryZonePatchSchema, handler: ({ params, body, ctx }) => shippingService.updateZone(ctx, params.id, body) });
const zoneDeleteRoute = defineRoute({ method: 'DELETE', csrf: false, permission: { resource: 'settings', action: 'edit' }, paramsSchema: z.object({ id: z.string() }), handler: ({ params, ctx }) => shippingService.deleteZone(ctx, params.id) });

const PHONE = '01077665511';
const ZONE_PREFIX = 'زون اختبار';
let userId = '';

async function sessionFor(phone: string, password: string): Promise<Record<string, string>> {
  const res = await callRoute(loginRoute, { method: 'POST', body: { identifier: phone, password } });
  return { [SESSION_COOKIE]: res.cookies[SESSION_COOKIE]! };
}
async function newZone(admin: Record<string, string>, body: Record<string, unknown>): Promise<{ id: string; deliveryFee: number }> {
  const res = await callRoute(zoneCreateRoute, { method: 'POST', cookies: admin, body: { nameAr: `${ZONE_PREFIX} ${Date.now()}`, nameEn: `Test Zone ${Date.now()}`, deliveryFee: 33, minOrder: 0, estimatedTimeAr: '45 دقيقة', estimatedTimeEn: '45 min', ...body } });
  expect(res.status).toBe(201);
  return res.body.data;
}
async function newAddress(session: Record<string, string>, body: Record<string, unknown>): Promise<CallResult> {
  return callRoute(addressRoute, { method: 'POST', cookies: session, body: { title: 'المنزل', recipientName: 'زبون المناطق', phone: PHONE, village: 'قرية عليم', streetAddress: 'شارع 7', isDefault: true, ...body } });
}
async function cartWith(session: Record<string, string>, lines: { productId: string; quantity: number }[]): Promise<void> {
  await callRoute(clearRoute, { method: 'DELETE', cookies: session });
  for (const l of lines) await callRoute(addRoute, { method: 'POST', body: l, cookies: session });
}

describe('delivery zones drive the delivery fee (integration)', () => {
  beforeAll(async () => {
    await cleanup();
    const reg = await callRoute(registerRoute, { method: 'POST', body: { name: 'زبون المناطق', phone: PHONE, password: 'Secret@123', defaultVillage: 'عليم' } });
    userId = reg.body.data.id;
  });
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it("charges the address zone's fee in the cart, the quote, the order and its snapshot — and follows an admin edit immediately", async () => {
    const admin = await sessionFor('01000000000', 'Admin@12345');
    const session = await sessionFor(PHONE, 'Secret@123');
    const zone = await newZone(admin, { deliveryFee: 33 });

    const addr = await newAddress(session, { zoneId: zone.id, village: 'زون اختبار' });
    expect(addr.status).toBe(201);
    expect(addr.body.data.zoneId).toBe(zone.id);

    await cartWith(session, [{ productId: 'prod_oil', quantity: 1 }]); // 95 — under the free-delivery threshold
    const cart = await callRoute(cartRoute, { cookies: session });
    expect(cart.body.data.deliveryFee).toBe(33);
    expect(cart.body.data.deliveryZone.id).toBe(zone.id);

    const quote = await callRoute(quoteRoute, { method: 'POST', cookies: session, body: { addressId: addr.body.data.id } });
    expect(quote.status).toBe(200);
    expect(quote.body.data.deliveryFee).toBe(33);
    expect(quote.body.data.total).toBe(128);
    expect(quote.body.data.zone.id).toBe(zone.id);

    const placed = await callRoute(checkoutRoute, { method: 'POST', cookies: session, headers: { 'idempotency-key': 'zn-order' }, body: { addressId: addr.body.data.id, paymentMethod: 'cod' } });
    expect(placed.status).toBe(201);
    expect(placed.body.data.order.deliveryFee).toBe(33);
    expect(placed.body.data.order.total).toBe(128);
    expect(placed.body.data.order.estimatedDelivery).toBe('45 دقيقة');
    const [row] = await db().select().from(orders).where(eq(orders.id, placed.body.data.order.id)).limit(1);
    expect((row!.deliveryAddress as { zoneId: string; zoneNameAr: string }).zoneId).toBe(zone.id);
    expect((row!.deliveryAddress as { zoneNameAr: string }).zoneNameAr).toMatch(/^زون اختبار/);

    // Staff change the price → the very next quote uses it (no deploy, no app update).
    expect((await callRoute(zonePatchRoute, { method: 'PATCH', cookies: admin, params: { id: zone.id }, body: { deliveryFee: 44 } })).status).toBe(200);
    await cartWith(session, [{ productId: 'prod_oil', quantity: 1 }]);
    const requote = await callRoute(quoteRoute, { method: 'POST', cookies: session, body: { addressId: addr.body.data.id } });
    expect(requote.body.data.deliveryFee).toBe(44);
  });

  it('resolves a village typed by name to its zone; an unknown village falls back to the store default fee', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const zones = (await callRoute(zonesPublicRoute, {})).body.data as { id: string; nameAr: string; deliveryFee: number }[];
    const elim = zones.find((z) => z.nameAr.includes('عليم'))!;
    expect(elim).toBeTruthy();

    const byName = await newAddress(session, { village: 'عليم' }); // no zoneId, no "قرية" prefix
    expect(byName.status).toBe(201);
    expect(byName.body.data.zoneId).toBe(elim.id);
    await cartWith(session, [{ productId: 'prod_oil', quantity: 1 }]);
    const q1 = await callRoute(quoteRoute, { method: 'POST', cookies: session, body: { addressId: byName.body.data.id } });
    expect(q1.body.data.deliveryFee).toBe(elim.deliveryFee);
    expect(q1.body.data.zone.id).toBe(elim.id);

    const unknown = await newAddress(session, { village: 'مكان غير معروف', isDefault: false });
    expect(unknown.body.data.zoneId).toBeUndefined();
    const q2 = await callRoute(quoteRoute, { method: 'POST', cookies: session, body: { addressId: unknown.body.data.id } });
    expect(q2.status).toBe(200);
    expect(q2.body.data.deliveryFee).toBe(15); // store default (seed)
    expect(q2.body.data.zone).toBeNull();
  });

  it('enforces the zone minimum order, and a zone that stops being served blocks checkout at that address', async () => {
    const admin = await sessionFor('01000000000', 'Admin@12345');
    const session = await sessionFor(PHONE, 'Secret@123');
    const zone = await newZone(admin, { deliveryFee: 20, minOrder: 100 });
    const addr = await newAddress(session, { zoneId: zone.id, village: 'زون اختبار' });

    await cartWith(session, [{ productId: 'prod_oil', quantity: 1 }]); // 95 < 100
    const short = await callRoute(quoteRoute, { method: 'POST', cookies: session, body: { addressId: addr.body.data.id } });
    expect(short.status).toBe(422);
    expect(short.body.error.code).toBe('MIN_ORDER_NOT_MET');
    expect(short.body.error.details ?? short.body.error.meta ?? {}).toBeTruthy();

    await cartWith(session, [{ productId: 'prod_oil', quantity: 2 }]); // 190 ≥ 100
    expect((await callRoute(quoteRoute, { method: 'POST', cookies: session, body: { addressId: addr.body.data.id } })).status).toBe(200);

    // Deactivated: gone from the public picker, checkout at that address is refused clearly.
    await callRoute(zonePatchRoute, { method: 'PATCH', cookies: admin, params: { id: zone.id }, body: { isActive: false } });
    const publicList = (await callRoute(zonesPublicRoute, {})).body.data as { id: string }[];
    expect(publicList.some((z) => z.id === zone.id)).toBe(false);
    const refused = await callRoute(quoteRoute, { method: 'POST', cookies: session, body: { addressId: addr.body.data.id } });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('ZONE_UNAVAILABLE');

    // Deleted: soft — hidden from the admin list too, the address keeps its reference.
    expect((await callRoute(zoneDeleteRoute, { method: 'DELETE', cookies: admin, params: { id: zone.id } })).status).toBe(200);
    const adminList = (await callRoute(zonesAdminRoute, { cookies: admin })).body.data as { id: string }[];
    expect(adminList.some((z) => z.id === zone.id)).toBe(false);
    const [zrow] = await db().select().from(deliveryZones).where(eq(deliveryZones.id, zone.id)).limit(1);
    expect(zrow!.deletedAt).not.toBeNull();
    const [arow] = await db().select().from(addresses).where(eq(addresses.id, addr.body.data.id)).limit(1);
    expect(arow!.zoneId).toBe(zone.id);
    expect((await callRoute(zonePatchRoute, { method: 'PATCH', cookies: admin, params: { id: zone.id }, body: { deliveryFee: 1 } })).status).toBe(404);
  });
});

async function cleanup() {
  const rows = await db().select({ id: users.id }).from(users).where(inArray(users.phone, [PHONE]));
  const ids = rows.map((r) => r.id);
  await withTriggersDisabled(async (tx) => {
    if (ids.length) {
      await tx.delete(notifications).where(inArray(notifications.userId, ids));
      await tx.delete(emailEvents).where(inArray(emailEvents.userId, ids));
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
    await tx.delete(deliveryZones).where(like(deliveryZones.nameAr, `${ZONE_PREFIX}%`));
    await tx.delete(stockMovements).where(inArray(stockMovements.productId, ['prod_oil']));
    await tx.update(inventoryItems).set({ quantityOnHand: 45, quantityReserved: 0 }).where(eq(inventoryItems.productId, 'prod_oil'));
  });
}
