/**
 * Native (mobile) transport contract + security tests (§46, §15). Drives the real
 * defineRoute pipeline the way the Flutter app will — Bearer + X-Ragab-Client — and
 * pins the two things that must never regress:
 *   1. The contract mobile depends on (token in body, Bearer auth, wishlist/devices/config).
 *   2. The CSRF exemption is scoped to non-ambient credentials: a COOKIE request can never
 *      escape CSRF by sending X-Ragab-Client (the exact attack the narrow rule prevents).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, gt, sql } from 'drizzle-orm';
import { defineRoute } from './handler';
import { callRoute } from '../test/http';
import { db, closeDb } from '../db/client';
import { users, products, productVariants, inventoryItems } from '../db/schema';
import { SESSION_COOKIE } from '../security/session';
import { authService, registerSchema, loginSchema } from '../modules/auth';
import { cartService, addToCartSchema } from '../modules/cart';
import { wishlistService, wishlistAddSchema, wishlistMergeSchema } from '../modules/wishlist';
import { deviceService, registerDeviceSchema, unregisterDeviceSchema } from '../modules/devices';
import { appConfigService } from '../modules/appconfig';
import { catalogService, suggestSchema } from '../modules/catalog';

// Routes mirror the real app/api/v1 adapters.
const registerRoute = defineRoute({
  method: 'POST', auth: 'none', csrf: false, bodySchema: registerSchema, successStatus: 201,
  handler: async ({ body, ctx }) => {
    const u = await authService.register(body, ctx);
    const s = authService.nativeSession(ctx);
    return s ? { user: u, session: s } : u;
  },
});
const loginRoute = defineRoute({
  method: 'POST', auth: 'none', csrf: false, bodySchema: loginSchema,
  handler: async ({ body, ctx }) => {
    const r = await authService.login(body, ctx);
    const s = authService.nativeSession(ctx);
    return s ? { ...r, session: s } : r;
  },
});
const meRoute = defineRoute({ method: 'GET', auth: 'required', handler: ({ ctx }) => authService.me(ctx) });
const addToCartRoute = defineRoute({ method: 'POST', auth: 'optional', bodySchema: addToCartSchema, handler: ({ body, ctx }) => cartService.addToCart(ctx, body.productId, body.quantity) });
const wishlistGet = defineRoute({ method: 'GET', auth: 'required', handler: ({ ctx }) => wishlistService.getWishlist(ctx) });
const wishlistAdd = defineRoute({ method: 'POST', auth: 'required', bodySchema: wishlistAddSchema, handler: ({ body, ctx }) => wishlistService.addToWishlist(ctx, body.productId) });
const wishlistMergeRoute = defineRoute({ method: 'POST', auth: 'required', bodySchema: wishlistMergeSchema, handler: ({ body, ctx }) => wishlistService.mergeWishlist(ctx, body.productIds) });
const deviceRegister = defineRoute({ method: 'POST', auth: 'required', bodySchema: registerDeviceSchema, handler: ({ body, ctx }) => deviceService.registerDevice(ctx, body) });
const deviceUnregister = defineRoute({ method: 'DELETE', auth: 'required', bodySchema: unregisterDeviceSchema, handler: ({ body, ctx }) => deviceService.unregisterDevice(ctx, body.token) });
const appConfigRoute = defineRoute({ method: 'GET', auth: 'none', handler: () => appConfigService.getAppConfig() });
const suggestRoute = defineRoute({ method: 'GET', auth: 'none', querySchema: suggestSchema, handler: ({ query }) => catalogService.suggestProducts(query) });

const PHONE = '01077553311';
const NATIVE = { 'x-ragab-client': 'mobile', 'x-device-id': 'test-device-abc123' };

let productId: string;

async function nativeLogin(): Promise<string> {
  const login = await callRoute(loginRoute, { method: 'POST', origin: null, headers: NATIVE, body: { identifier: PHONE, password: 'Secret@123' } });
  return login.body.data.session.token as string;
}

describe('native mobile transport (integration)', () => {
  beforeAll(async () => {
    await db().delete(users).where(eq(users.phone, PHONE));
    // Must actually be addable to a cart, not merely "any active product" — a plain
    // `LIMIT 1` with no ordering picked whichever row Postgres' scan happened to return
    // first, which was harmless while the catalog was 12 seeded demo products (all with
    // real stock) but silently breaks once real inventory-zero products exist: this test
    // then adds an out-of-stock item and correctly gets totalItems back as 0, which looks
    // like addToCart is broken when the fixture selection is what's wrong.
    const [p] = await db()
      .select({ id: products.id })
      .from(products)
      .innerJoin(productVariants, and(eq(productVariants.productId, products.id), eq(productVariants.isDefault, true)))
      .innerJoin(inventoryItems, eq(inventoryItems.variantId, productVariants.id))
      .where(and(eq(products.isActive, true), gt(sql`${inventoryItems.quantityOnHand} - ${inventoryItems.quantityReserved}`, 0)))
      .limit(1);
    productId = p!.id;
  });
  afterAll(async () => {
    await db().delete(users).where(eq(users.phone, PHONE));
    await closeDb();
  });

  it('native register returns { user, session:{token,expiresAt} } with NO Origin required', async () => {
    const res = await callRoute(registerRoute, {
      method: 'POST',
      origin: null, // native clients send no Origin — must NOT be rejected
      headers: NATIVE,
      body: { name: 'موبايل', phone: PHONE, password: 'Secret@123', defaultVillage: 'عليم' },
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.phone).toBe(PHONE);
    expect(typeof res.body.data.session.token).toBe('string');
    expect(res.body.data.session.token.length).toBeGreaterThan(20);
    expect(typeof res.body.data.session.expiresAt).toBe('string');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
  });

  it('native login returns a Bearer token that authenticates /me with NO cookie', async () => {
    const token = await nativeLogin();
    expect(token).toBeTruthy();
    const me = await callRoute(meRoute, { headers: { authorization: `Bearer ${token}`, ...NATIVE } });
    expect(me.status).toBe(200);
    expect(me.body.data.user.phone).toBe(PHONE);
    expect(Array.isArray(me.body.data.permissions)).toBe(true);
  });

  it('a Bearer-authenticated mutation with NO Origin and NO csrf token succeeds', async () => {
    const token = await nativeLogin();
    const res = await callRoute(addToCartRoute, {
      method: 'POST',
      origin: null,
      headers: { authorization: `Bearer ${token}`, ...NATIVE },
      body: { productId, quantity: 2 },
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalItems).toBeGreaterThan(0);
  });

  it('SECURITY: a COOKIE request cannot escape CSRF by spoofing X-Ragab-Client', async () => {
    const token = await nativeLogin();
    // Present the token as an ambient COOKIE (not Bearer), spoof the native header, drop origin + csrf.
    const res = await callRoute(addToCartRoute, {
      method: 'POST',
      origin: null,
      headers: NATIVE, // spoofed
      cookies: { [SESSION_COOKIE]: token },
      body: { productId, quantity: 1 },
    });
    // Forbidden (403), not "signed out" (401): a CSRF failure must never log a customer out.
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_ORIGIN_MISMATCH');
  });

  it('wishlist: Bearer add then get shows the product (shared source of truth)', async () => {
    const token = await nativeLogin();
    const auth = { authorization: `Bearer ${token}`, ...NATIVE };
    const add = await callRoute(wishlistAdd, { method: 'POST', origin: null, headers: auth, body: { productId } });
    expect(add.status).toBe(200);
    expect(add.body.data.some((p: { id: string }) => p.id === productId)).toBe(true);
    const get = await callRoute(wishlistGet, { headers: auth });
    expect(get.status).toBe(200);
    expect(get.body.data.some((p: { id: string }) => p.id === productId)).toBe(true);
  });

  it('wishlist merge is idempotent (dedupes repeats)', async () => {
    const token = await nativeLogin();
    const auth = { authorization: `Bearer ${token}`, ...NATIVE };
    const merged = await callRoute(wishlistMergeRoute, { method: 'POST', origin: null, headers: auth, body: { productIds: [productId, productId] } });
    expect(merged.status).toBe(200);
    expect(merged.body.data.filter((p: { id: string }) => p.id === productId).length).toBe(1);
  });

  it('devices: register then unregister a push token', async () => {
    const token = await nativeLogin();
    const auth = { authorization: `Bearer ${token}`, ...NATIVE };
    const reg = await callRoute(deviceRegister, { method: 'POST', origin: null, headers: auth, body: { token: 'fcm-token-1234567890', platform: 'android', appVersion: '1.0.0' } });
    expect(reg.status).toBe(200);
    expect(reg.body.data.ok).toBe(true);
    const del = await callRoute(deviceUnregister, { method: 'DELETE', origin: null, headers: auth, body: { token: 'fcm-token-1234567890' } });
    expect(del.status).toBe(200);
  });

  it('app/config is public and reports the version gate + store facts', async () => {
    const res = await callRoute(appConfigRoute, { origin: null, headers: NATIVE });
    expect(res.status).toBe(200);
    expect(typeof res.body.data.minimumSupportedVersion).toBe('string');
    expect(res.body.data.store.currency).toBe('EGP');
    expect(typeof res.body.data.payments.cod).toBe('boolean');
  });

  it('product suggest requires q (bounded input)', async () => {
    const res = await callRoute(suggestRoute, { origin: null, headers: NATIVE });
    expect(res.status).toBe(400);
  });
});
