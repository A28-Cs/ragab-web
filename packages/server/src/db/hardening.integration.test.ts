/**
 * Migration 0010 invariants: one active cart per user under concurrency, one device-token
 * row per (user, device) across token rotation, boolean order flags.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { defineRoute } from '../http/handler';
import { callRoute } from '../test/http';
import { withTriggersDisabled } from '../test/db';
import { db, closeDb } from './client';
import { users, carts, cartItems, deviceTokens, orders } from './schema';
import { SESSION_COOKIE } from '../security/session';
import type { RequestContext } from '../http/context';
import { authService, registerSchema, loginSchema } from '../modules/auth';
import { cartService, addToCartSchema } from '../modules/cart';
import { registerDevice } from '../modules/devices/service';

const registerRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: registerSchema, handler: ({ body, ctx }) => authService.register(body, ctx) });
const loginRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: loginSchema, handler: ({ body, ctx }) => authService.login(body, ctx) });
const addRoute = defineRoute({ method: 'POST', csrf: false, auth: 'optional', bodySchema: addToCartSchema, handler: ({ body, ctx }) => cartService.addToCart(ctx, body.productId, body.quantity ?? 1) });

const PHONE = '01077665499';
let userId = '';

describe('schema hardening (integration)', () => {
  beforeAll(async () => {
    await cleanup();
    const reg = await callRoute(registerRoute, { method: 'POST', body: { name: 'مُحكم', phone: PHONE, password: 'Secret@123', defaultVillage: 'عليم' } });
    userId = reg.body.data.id;
  });
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('five first requests racing to create the cart leave exactly ONE active cart', async () => {
    const res = await callRoute(loginRoute, { method: 'POST', body: { identifier: PHONE, password: 'Secret@123' } });
    const session = { [SESSION_COOKIE]: res.cookies[SESSION_COOKIE]! };
    // Register a customer without ever touching the cart, then hit add-to-cart concurrently.
    const results = await Promise.all(Array.from({ length: 5 }, () => callRoute(addRoute, { method: 'POST', cookies: session, body: { productId: 'prod_oil', quantity: 1 } })));
    expect(results.every((r) => r.status === 200)).toBe(true);
    const active = await db().select({ id: carts.id }).from(carts).where(and(eq(carts.userId, userId), eq(carts.status, 'active')));
    expect(active).toHaveLength(1);
  });

  it('a rotated push token on the same device replaces the old row (one row per user+device)', async () => {
    const ctx = { principal: { userId }, deviceId: 'dev-hardening-1' } as unknown as RequestContext;
    await registerDevice(ctx, { token: 'fcm-token-old', platform: 'android', appVersion: '1.0.0' });
    await registerDevice(ctx, { token: 'fcm-token-new', platform: 'android', appVersion: '1.0.1' });
    const rows = await db().select().from(deviceTokens).where(eq(deviceTokens.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token).toBe('fcm-token-new');
    expect(rows[0]!.deviceId).toBe('dev-hardening-1');
    // Re-registering the SAME token is a plain refresh, never a duplicate or an error.
    await registerDevice(ctx, { token: 'fcm-token-new', platform: 'android', appVersion: '1.0.2' });
    expect((await db().select().from(deviceTokens).where(eq(deviceTokens.userId, userId))).length).toBe(1);
  });

  it('order flags are booleans in the schema (no more "true"/"false" strings)', async () => {
    // information_schema is the authority on what the migration actually did.
    expect(await columnType('manual')).toBe('boolean');
    expect(await columnType('refunded')).toBe('boolean');
    expect(orders.manual.dataType).toBe('boolean');
  });
});

async function columnType(column: string): Promise<string> {
  const rows = (await db().execute(
    sql`SELECT data_type FROM information_schema.columns WHERE table_name = 'orders' AND column_name = ${column}`,
  )) as unknown as { data_type: string }[];
  return rows[0]!.data_type;
}

async function cleanup() {
  const rows = await db().select({ id: users.id }).from(users).where(inArray(users.phone, [PHONE]));
  const ids = rows.map((r) => r.id);
  if (!ids.length) return;
  await withTriggersDisabled(async (tx) => {
    await tx.delete(deviceTokens).where(inArray(deviceTokens.userId, ids));
    const cs = await tx.select({ id: carts.id }).from(carts).where(inArray(carts.userId, ids));
    const cids = cs.map((c: { id: string }) => c.id);
    if (cids.length) await tx.delete(cartItems).where(inArray(cartItems.cartId, cids));
    await tx.delete(carts).where(inArray(carts.userId, ids));
    await tx.delete(users).where(inArray(users.id, ids));
  });
}
