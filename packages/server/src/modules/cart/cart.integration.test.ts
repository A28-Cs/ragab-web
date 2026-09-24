import { describe, it, expect, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { defineRoute } from '../../http/handler';
import { cartService, addToCartSchema } from '.';
import { authService, registerSchema } from '../auth';
import { callRoute } from '../../test/http';
import { withTriggersDisabled } from '../../test/db';
import { db, closeDb } from '../../db/client';
import { carts, cartItems, users, addresses } from '../../db/schema';
import { hashToken } from '../../security/tokens';
import { CART_COOKIE } from './service';

const addRoute = defineRoute({ method: 'POST', auth: 'optional', csrf: false, bodySchema: addToCartSchema, handler: ({ body, ctx }) => cartService.addToCart(ctx, body.productId, body.quantity ?? 1) });
const getRoute = defineRoute({ method: 'GET', auth: 'optional', handler: ({ ctx }) => cartService.getPricedCart(ctx) });

/** Thread the anon cart cookie across calls. */
async function add(productId: string, quantity: number, cookies: Record<string, string>) {
  const res = await callRoute(addRoute, { method: 'POST', body: { productId, quantity }, cookies });
  if (res.cookies[CART_COOKIE]) cookies[CART_COOKIE] = res.cookies[CART_COOKIE];
  return res;
}

describe('cart (integration) — server-authoritative pricing (§8)', () => {
  afterAll(() => closeDb());

  it('prices the cart entirely server-side; delivery follows the settings rule', async () => {
    const jar: Record<string, string> = {};
    // Oil is 95 EGP. Add 2 → subtotal 190, below 300 threshold → 15 delivery.
    let res = await add('prod_oil', 2, jar);
    expect(res.status).toBe(200);
    expect(res.body.data.subtotal).toBe(190);
    expect(res.body.data.deliveryFee).toBe(15);
    expect(res.body.data.total).toBe(205);
    expect(res.body.data.totalItems).toBe(2);

    // Add rice (135 EGP) → subtotal 325 ≥ 300 → free delivery.
    res = await add('prod_rice', 1, jar);
    expect(res.body.data.subtotal).toBe(325);
    expect(res.body.data.deliveryFee).toBe(0);
    expect(res.body.data.total).toBe(325);
  });

  it('ignores any client-supplied price/total fields (strict schema)', async () => {
    const res = await callRoute(addRoute, {
      method: 'POST',
      body: { productId: 'prod_oil', quantity: 1, price: 1, total: 1 },
    });
    // Unknown keys rejected by the strict schema — the client cannot inject a price.
    expect(res.status).toBe(400);
  });

  it('clamps quantity to available stock', async () => {
    const jar: Record<string, string> = {};
    const res = await add('prod_oil', 99, jar); // request more than seeded stock (45)
    expect(res.body.data.items[0].quantity).toBeLessThanOrEqual(45);
  });

  it('an empty/unknown cart returns zeroed totals with the correct threshold', async () => {
    const res = await callRoute(getRoute);
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.freeDeliveryThreshold).toBe(300);
    expect(res.body.data.items).toEqual([]);
  });

  it('a native guest cart is keyed on the device id (no cookie) and survives across requests', async () => {
    const native = { 'x-ragab-client': 'mobile', 'x-device-id': 'device-cart-guest-0001' };
    // Device carts persist by design — start from a clean one for this install.
    await cleanupGuest('device-cart-guest-0001');
    await cleanupGuest('device-cart-guest-0002');
    const first = await callRoute(addRoute, { method: 'POST', body: { productId: 'prod_oil', quantity: 2 }, headers: native, origin: null });
    expect(first.status).toBe(200);
    expect(first.cookies[CART_COOKIE]).toBeUndefined(); // nothing to hand back — the device IS the identity

    // A later request from the same install (still no cookie jar) sees the same cart.
    const again = await callRoute(getRoute, { headers: native, origin: null });
    expect(again.body.data.totalItems).toBe(2);
    expect(again.body.data.items[0].product.id).toBe('prod_oil');

    // A different install has its own, empty cart.
    const other = await callRoute(getRoute, { headers: { ...native, 'x-device-id': 'device-cart-guest-0002' }, origin: null });
    expect(other.body.data.items).toEqual([]);
  });

  it('signing in on the device merges the guest cart into the account cart', async () => {
    const PHONE = '01077665577';
    const native = { 'x-ragab-client': 'mobile', 'x-device-id': 'device-cart-merge-0001' };
    await cleanupUser(PHONE);
    await callRoute(addRoute, { method: 'POST', body: { productId: 'prod_rice', quantity: 1 }, headers: native, origin: null });

    const reg = await callRoute(registerRoute, { method: 'POST', body: { name: 'ضيف', phone: PHONE, password: 'Secret@123', defaultVillage: 'عليم' }, headers: native, origin: null });
    expect(reg.status).toBe(201);
    const token = reg.body.data.session?.token as string;
    expect(token).toBeTruthy();

    const mine = await callRoute(getRoute, { headers: { ...native, authorization: `Bearer ${token}` }, origin: null });
    expect(mine.body.data.items.map((l: { product: { id: string } }) => l.product.id)).toEqual(['prod_rice']);

    // The guest cart was consumed, not duplicated: a fresh guest on the same device starts empty.
    const [abandoned] = await db().select().from(carts).where(eq(carts.anonymousToken, hashToken('dev:device-cart-merge-0001'))).limit(1);
    expect(abandoned?.status).toBe('abandoned');
    await cleanupUser(PHONE);
  });
});

// Mirrors apps/web/src/app/api/v1/auth/register/route.ts: native clients get { user, session }.
const registerRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: registerSchema, successStatus: 201, handler: async ({ body, ctx }) => {
  const user = await authService.register(body, ctx);
  const session = authService.nativeSession(ctx);
  return session ? { user, session } : user;
} });

async function cleanupGuest(deviceId: string) {
  await withTriggersDisabled(async (tx) => {
    const guest = await tx.select({ id: carts.id }).from(carts).where(eq(carts.anonymousToken, hashToken(`dev:${deviceId}`)));
    const gids = guest.map((c: { id: string }) => c.id);
    if (gids.length) {
      await tx.delete(cartItems).where(inArray(cartItems.cartId, gids));
      await tx.delete(carts).where(inArray(carts.id, gids));
    }
  });
}

async function cleanupUser(phone: string) {
  const rows = await db().select({ id: users.id }).from(users).where(eq(users.phone, phone));
  const ids = rows.map((r) => r.id);
  await withTriggersDisabled(async (tx) => {
    if (ids.length) {
      const cs = await tx.select({ id: carts.id }).from(carts).where(inArray(carts.userId, ids));
      const cids = cs.map((c: { id: string }) => c.id);
      if (cids.length) await tx.delete(cartItems).where(inArray(cartItems.cartId, cids));
      await tx.delete(carts).where(inArray(carts.userId, ids));
      await tx.delete(addresses).where(inArray(addresses.userId, ids));
      await tx.delete(users).where(inArray(users.id, ids));
    }
    const guest = await tx.select({ id: carts.id }).from(carts).where(eq(carts.anonymousToken, hashToken('dev:device-cart-merge-0001')));
    const gids = guest.map((c: { id: string }) => c.id);
    if (gids.length) {
      await tx.delete(cartItems).where(inArray(cartItems.cartId, gids));
      await tx.delete(carts).where(inArray(carts.id, gids));
    }
  });
}
