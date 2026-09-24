import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { authenticator } from 'otplib';
import { and, eq, inArray, like } from 'drizzle-orm';
import { defineRoute } from '../../http/handler';
import { callRoute } from '../../test/http';
import { withTriggersDisabled } from '../../test/db';
import { db, closeDb } from '../../db/client';
import {
  users,
  sessions,
  addresses,
  wishlists,
  carts,
  deviceTokens,
  mfaSecrets,
  orders,
  orderStatusHistory,
} from '../../db/schema';
import { SESSION_COOKIE } from '../../security/session';
import {
  authService,
  twoFactorService,
  registerSchema,
  loginSchema,
  deleteAccountSchema,
  twoFactorEnableSchema,
} from '.';

const registerRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: registerSchema, successStatus: 201, handler: ({ body, ctx }) => authService.register(body, ctx) });
const loginRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: loginSchema, handler: ({ body, ctx }) => authService.login(body, ctx) });
const meRoute = defineRoute({ method: 'GET', auth: 'required', handler: ({ ctx }) => authService.me(ctx) });
const deleteRoute = defineRoute({
  method: 'DELETE',
  csrf: false,
  auth: 'required',
  bodySchema: deleteAccountSchema,
  handler: async ({ body, ctx }) => {
    await authService.deleteAccount(body, ctx);
    return { ok: true };
  },
});
const setupRoute = defineRoute({ method: 'POST', csrf: false, auth: 'required', handler: ({ ctx }) => twoFactorService.setupTwoFactor(ctx) });
const enableRoute = defineRoute({ method: 'POST', csrf: false, auth: 'required', bodySchema: twoFactorEnableSchema, handler: ({ body, ctx }) => twoFactorService.enableTwoFactor(ctx, body.code) });

const PHONE = '01023456781';
const PHONE_2FA = '01023456782';
const PASSWORD = 'Secret@123';
const ORDER_ID = 'ord_test_account_deletion';
const DEVICE_TOKEN = 'fcm_test_account_deletion';

async function cleanup(): Promise<void> {
  await withTriggersDisabled(async (tx) => {
    await tx.delete(orderStatusHistory).where(eq(orderStatusHistory.orderId, ORDER_ID));
    await tx.delete(orders).where(eq(orders.id, ORDER_ID));
  });
  await db().delete(deviceTokens).where(eq(deviceTokens.token, DEVICE_TOKEN));
  await db().delete(users).where(inArray(users.phone, [PHONE, PHONE_2FA]));
  // Anonymized rows from previous runs are only findable by their placeholder phone.
  await db().delete(users).where(like(users.phone, 'deleted:%'));
}

describe('account deletion (integration)', () => {
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('requires the correct password, anonymizes PII, revokes sessions, and keeps orders', async () => {
    // Register and grab the session.
    const reg = await callRoute(registerRoute, {
      method: 'POST',
      body: { name: 'صاحب الحساب', phone: PHONE, password: PASSWORD, defaultVillage: 'عليم' },
    });
    expect(reg.status).toBe(201);
    const userId: string = (await db().select({ id: users.id }).from(users).where(eq(users.phone, PHONE)))[0]!.id;
    const session = { [SESSION_COOKIE]: reg.cookies[SESSION_COOKIE]! };

    // Seed account-scoped data plus an order with append-only history.
    await db().insert(addresses).values({
      userId, title: 'المنزل', recipientName: 'صاحب الحساب', phone: PHONE, village: 'عليم', streetAddress: 'شارع ١',
    });
    await db().insert(wishlists).values({ userId });
    await db().insert(carts).values({ userId, status: 'active' });
    await db().insert(deviceTokens).values({ userId, token: DEVICE_TOKEN, platform: 'android' });
    await db().insert(orders).values({
      id: ORDER_ID,
      orderNumber: `TEST-DEL-${Date.now()}`,
      userId,
      status: 'pending',
      paymentStatus: 'pending',
      fulfillmentStatus: 'unfulfilled',
      paymentMethod: 'cod',
      currency: 'EGP',
      subtotalMinor: 0,
      deliveryFeeMinor: 0,
      taxMinor: 0,
      discountMinor: 0,
      totalMinor: 0,
      deliveryAddress: { recipientName: 'صاحب الحساب', phone: PHONE, village: 'عليم', streetAddress: 'شارع ١' },
      estimatedDelivery: '30 - 45 دقيقة',
    });
    await db().insert(orderStatusHistory).values({ orderId: ORDER_ID, fromStatus: null, toStatus: 'pending', kind: 'order', actorId: userId });

    // Wrong password → 401 and nothing is touched.
    const wrong = await callRoute(deleteRoute, { method: 'DELETE', cookies: session, body: { reauthPassword: 'WrongPass@1' } });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('REAUTH_REQUIRED');
    const [untouched] = await db().select().from(users).where(eq(users.id, userId));
    expect(untouched!.phone).toBe(PHONE);

    // Anonymous / no session → 401.
    const anon = await callRoute(deleteRoute, { method: 'DELETE', body: { reauthPassword: PASSWORD } });
    expect(anon.status).toBe(401);

    // Correct password → account deleted.
    const del = await callRoute(deleteRoute, { method: 'DELETE', cookies: session, body: { reauthPassword: PASSWORD } });
    expect(del.status).toBe(200);
    expect(del.body.data.ok).toBe(true);

    // PII anonymized in place; login is permanently impossible.
    const [row] = await db().select().from(users).where(eq(users.id, userId));
    expect(row!.name).toBe('Deleted User');
    expect(row!.phone).toBe(`deleted:${userId}`);
    expect(row!.email).toBeNull();
    expect(row!.passwordHash).toBeNull();
    expect(row!.status).toBe('disabled');

    // The old session no longer works and no session row is left active.
    const me = await callRoute(meRoute, { cookies: session });
    expect(me.status).toBe(401);
    const activeSessions = await db().select().from(sessions).where(eq(sessions.userId, userId));
    expect(activeSessions.every((s) => s.revokedAt !== null)).toBe(true);

    // Account-scoped data is purged.
    expect(await db().select().from(addresses).where(eq(addresses.userId, userId))).toHaveLength(0);
    expect(await db().select().from(wishlists).where(eq(wishlists.userId, userId))).toHaveLength(0);
    expect(await db().select().from(carts).where(eq(carts.userId, userId))).toHaveLength(0);
    expect(await db().select().from(deviceTokens).where(eq(deviceTokens.userId, userId))).toHaveLength(0);

    // Financial records survive, still linked to the anonymized user, history untouched.
    const [order] = await db().select().from(orders).where(eq(orders.id, ORDER_ID));
    expect(order).toBeDefined();
    expect(order!.userId).toBe(userId);
    expect(await db().select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, ORDER_ID))).toHaveLength(1);

    // Old credentials get the same generic error as an unknown user.
    const login = await callRoute(loginRoute, { method: 'POST', body: { identifier: PHONE, password: PASSWORD } });
    expect(login.status).toBe(401);
    expect(login.body.error.code).toBe('INVALID_CREDENTIALS');

    // The phone number is freed for a fresh registration.
    const rereg = await callRoute(registerRoute, { method: 'POST', body: { name: 'جديد', phone: PHONE, password: PASSWORD } });
    expect(rereg.status).toBe(201);
  });

  it('additionally requires a TOTP code when 2FA is enabled', async () => {
    const reg = await callRoute(registerRoute, { method: 'POST', body: { name: 'ثنائي', phone: PHONE_2FA, password: PASSWORD } });
    const session = { [SESSION_COOKIE]: reg.cookies[SESSION_COOKIE]! };
    const userId: string = (await db().select({ id: users.id }).from(users).where(eq(users.phone, PHONE_2FA)))[0]!.id;

    const setup = await callRoute(setupRoute, { method: 'POST', cookies: session });
    const secret: string = setup.body.data.secret;
    const enable = await callRoute(enableRoute, { method: 'POST', cookies: session, body: { code: authenticator.generate(secret) } });
    expect(enable.status).toBe(200);

    // Password alone is not enough.
    const noCode = await callRoute(deleteRoute, { method: 'DELETE', cookies: session, body: { reauthPassword: PASSWORD } });
    expect(noCode.status).toBe(401);
    expect(noCode.body.error.code).toBe('TWO_FACTOR_REQUIRED');

    // Wrong code is rejected.
    const badCode = await callRoute(deleteRoute, { method: 'DELETE', cookies: session, body: { reauthPassword: PASSWORD, code: '000000' } });
    expect(badCode.status).toBe(401);
    expect(badCode.body.error.code).toBe('INVALID_2FA_CODE');

    // Password + valid TOTP deletes the account and the MFA secret.
    const del = await callRoute(deleteRoute, {
      method: 'DELETE',
      cookies: session,
      body: { reauthPassword: PASSWORD, code: authenticator.generate(secret) },
    });
    expect(del.status).toBe(200);
    const [row] = await db().select().from(users).where(eq(users.id, userId));
    expect(row!.twoFactorEnabled).toBe(false);
    expect(row!.passwordHash).toBeNull();
    expect(await db().select().from(mfaSecrets).where(and(eq(mfaSecrets.userId, userId)))).toHaveLength(0);
  });
});
