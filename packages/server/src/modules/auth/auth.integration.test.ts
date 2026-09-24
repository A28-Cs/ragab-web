import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { defineRoute } from '../../http/handler';
import { authService, registerSchema, loginSchema, updateProfileSchema } from '.';
import { callRoute } from '../../test/http';
import { db, closeDb } from '../../db/client';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { SESSION_COOKIE } from '../../security/session';
import { CSRF_COOKIE } from '../../security/csrf';

const registerRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: registerSchema, successStatus: 201, handler: ({ body, ctx }) => authService.register(body, ctx) });
const loginRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: loginSchema, handler: ({ body, ctx }) => authService.login(body, ctx) });
const meRoute = defineRoute({ method: 'GET', auth: 'required', handler: ({ ctx }) => authService.me(ctx) });
const profileRoute = defineRoute({ method: 'PATCH', auth: 'required', bodySchema: updateProfileSchema, handler: ({ body, ctx }) => authService.updateProfile(ctx, body) });

const PHONE = '01099887766';

describe('auth flow (integration)', () => {
  beforeAll(async () => {
    await db().delete(users).where(eq(users.phone, PHONE));
  });
  afterAll(async () => {
    await db().delete(users).where(eq(users.phone, PHONE));
    await closeDb();
  });

  it('registers, sets session + csrf cookies, and returns the user', async () => {
    const res = await callRoute(registerRoute, {
      method: 'POST',
      body: { name: 'مختبر', phone: PHONE, password: 'Secret@123', defaultVillage: 'عليم' },
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.phone).toBe(PHONE);
    expect(res.body.data).not.toHaveProperty('passwordHash');
    expect(res.cookies[SESSION_COOKIE]).toBeTruthy();
    expect(res.cookies[CSRF_COOKIE]).toBeTruthy();
  });

  it('rejects duplicate registration', async () => {
    const res = await callRoute(registerRoute, {
      method: 'POST',
      body: { name: 'مختبر', phone: PHONE, password: 'Secret@123' },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHONE_ALREADY_REGISTERED');
  });

  it('rejects wrong password with a generic error (no enumeration)', async () => {
    const res = await callRoute(loginRoute, { method: 'POST', body: { identifier: PHONE, password: 'WrongPass1' } });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects unknown user with the SAME generic error', async () => {
    const res = await callRoute(loginRoute, { method: 'POST', body: { identifier: '01055554444', password: 'Whatever1' } });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('logs in and can read /me with the session cookie', async () => {
    const login = await callRoute(loginRoute, { method: 'POST', body: { identifier: PHONE, password: 'Secret@123' } });
    expect(login.status).toBe(200);
    const token = login.cookies[SESSION_COOKIE];
    expect(token).toBeTruthy();

    const meAnon = await callRoute(meRoute);
    expect(meAnon.status).toBe(401);

    const me = await callRoute(meRoute, { cookies: { [SESSION_COOKIE]: token } });
    expect(me.status).toBe(200);
    expect(me.body.data.user.phone).toBe(PHONE);
    expect(Array.isArray(me.body.data.permissions)).toBe(true);
  });

  it('PATCHes the house photo URL onto the profile and reflects it on /me', async () => {
    const login = await callRoute(loginRoute, { method: 'POST', body: { identifier: PHONE, password: 'Secret@123' } });
    const token = login.cookies[SESSION_COOKIE];
    const csrf = login.cookies[CSRF_COOKIE];
    expect(token).toBeTruthy();
    expect(csrf).toBeTruthy();

    const patch = await callRoute(profileRoute, {
      method: 'PATCH',
      cookies: { [SESSION_COOKIE]: token, [CSRF_COOKIE]: csrf },
      csrfToken: csrf,
      body: { houseImage: 'https://cdn.example.com/house-photos/img_abc.jpg' },
    });
    expect(patch.status).toBe(200);
    expect(patch.body.data.houseImage).toBe('https://cdn.example.com/house-photos/img_abc.jpg');

    const me = await callRoute(meRoute, { cookies: { [SESSION_COOKIE]: token } });
    expect(me.body.data.user.houseImage).toBe('https://cdn.example.com/house-photos/img_abc.jpg');
  });

  it('strips unknown fields (mass-assignment): isStaff cannot be set at register', async () => {
    const phone = '01088776655';
    await db().delete(users).where(eq(users.phone, phone));
    const res = await callRoute(registerRoute, {
      method: 'POST',
      body: { name: 'x', phone, password: 'Secret@123', isStaff: true, roleId: 'role_owner' },
    });
    // .strict() rejects unknown keys outright.
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    await db().delete(users).where(eq(users.phone, phone));
  });
});
