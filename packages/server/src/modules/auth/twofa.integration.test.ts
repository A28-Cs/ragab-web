import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { authenticator } from 'otplib';
import { defineRoute } from '../../http/handler';
import { callRoute } from '../../test/http';
import { db, closeDb } from '../../db/client';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { SESSION_COOKIE } from '../../security/session';
import { authService, twoFactorService, registerSchema, loginSchema, twoFactorEnableSchema, twoFactorVerifyLoginSchema } from '.';

const registerRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: registerSchema, handler: ({ body, ctx }) => authService.register(body, ctx) });
const loginRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: loginSchema, handler: ({ body, ctx }) => authService.login(body, ctx) });
const setupRoute = defineRoute({ method: 'POST', csrf: false, auth: 'required', handler: ({ ctx }) => twoFactorService.setupTwoFactor(ctx) });
const enableRoute = defineRoute({ method: 'POST', csrf: false, auth: 'required', bodySchema: twoFactorEnableSchema, handler: ({ body, ctx }) => twoFactorService.enableTwoFactor(ctx, body.code) });
const verifyLoginRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: twoFactorVerifyLoginSchema, handler: ({ body, ctx }) => authService.completeTwoFactorLogin(body.challenge, body.code, ctx) });

const PHONE = '01066554433';

describe('two-factor authentication (integration, §9)', () => {
  beforeAll(async () => { await db().delete(users).where(eq(users.phone, PHONE)); });
  afterAll(async () => { await db().delete(users).where(eq(users.phone, PHONE)); await closeDb(); });

  it('sets up, enables, and requires 2FA on next login', async () => {
    // Register → session.
    const reg = await callRoute(registerRoute, { method: 'POST', body: { name: 'ثنائي', phone: PHONE, password: 'Secret@123' } });
    const session = { [SESSION_COOKIE]: reg.cookies[SESSION_COOKIE]! };

    // Setup → secret.
    const setup = await callRoute(setupRoute, { method: 'POST', cookies: session });
    expect(setup.status).toBe(200);
    const secret: string = setup.body.data.secret;
    expect(secret).toBeTruthy();
    expect(setup.body.data.otpauthUri).toContain('otpauth://');

    // Enable with a valid TOTP code → recovery codes returned.
    const code = authenticator.generate(secret);
    const enable = await callRoute(enableRoute, { method: 'POST', cookies: session, body: { code } });
    expect(enable.status).toBe(200);
    expect(Array.isArray(enable.body.data.recoveryCodes)).toBe(true);
    expect(enable.body.data.recoveryCodes.length).toBe(8);
    const recovery: string[] = enable.body.data.recoveryCodes;

    // Login now returns a challenge, NOT a session.
    const login = await callRoute(loginRoute, { method: 'POST', body: { identifier: PHONE, password: 'Secret@123' } });
    expect(login.body.data.requires2FA).toBe(true);
    expect(login.cookies[SESSION_COOKIE]).toBeFalsy(); // no session issued yet
    const challenge: string = login.body.data.challenge;

    // Wrong code is rejected.
    const bad = await callRoute(verifyLoginRoute, { method: 'POST', body: { challenge, code: '000000' } });
    expect(bad.status).toBe(401);

    // Correct TOTP completes the login and issues a session.
    const good = await callRoute(verifyLoginRoute, { method: 'POST', body: { challenge, code: authenticator.generate(secret) } });
    expect(good.status).toBe(200);
    expect(good.cookies[SESSION_COOKIE]).toBeTruthy();
    expect(good.body.data.phone).toBe(PHONE);

    // A recovery code also works (one-time) on a fresh challenge.
    const login2 = await callRoute(loginRoute, { method: 'POST', body: { identifier: PHONE, password: 'Secret@123' } });
    const rec = await callRoute(verifyLoginRoute, { method: 'POST', body: { challenge: login2.body.data.challenge, code: recovery[0] } });
    expect(rec.status).toBe(200);

    // The same recovery code cannot be reused.
    const login3 = await callRoute(loginRoute, { method: 'POST', body: { identifier: PHONE, password: 'Secret@123' } });
    const reuse = await callRoute(verifyLoginRoute, { method: 'POST', body: { challenge: login3.body.data.challenge, code: recovery[0] } });
    expect(reuse.status).toBe(401);
  });
});
