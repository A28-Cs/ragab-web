/**
 * The error contract every client relies on (P3-6): 401 means "not signed in" and ONLY
 * that; a CSRF failure or a missing permission is 403; a business rule is 422. The
 * mobile app signs the customer out on 401 — so a stale CSRF token must never be one.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { z } from 'zod';
import { defineRoute } from './handler';
import { callRoute } from '../test/http';
import { closeDb } from '../db/client';
import { SESSION_COOKIE } from '../security/session';
import { authService, loginSchema } from '../modules/auth';

const loginRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: loginSchema, handler: ({ body, ctx }) => authService.login(body, ctx) });
const mutating = defineRoute({ method: 'POST', auth: 'none', bodySchema: z.object({}).strict(), handler: () => ({ ok: true }) });
const signedInRead = defineRoute({ method: 'GET', auth: 'required', handler: ({ ctx }) => ({ me: ctx.principal!.userId }) });
const staffOnly = defineRoute({ method: 'GET', permission: { resource: 'orders', action: 'view' }, handler: () => ({ ok: true }) });

async function sessionFor(phone: string, password: string): Promise<Record<string, string>> {
  const res = await callRoute(loginRoute, { method: 'POST', body: { identifier: phone, password } });
  return { [SESSION_COOKIE]: res.cookies[SESSION_COOKIE]! };
}

afterAll(async () => {
  await closeDb();
});

describe('401 vs 403 vs CSRF (integration)', () => {
  it('a mutating request without the double-submit token is FORBIDDEN (403), not "signed out" (401)', async () => {
    const res = await callRoute(mutating, { method: 'POST', body: {} });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_TOKEN_INVALID');
  });

  it('a mutating request from an unknown origin is FORBIDDEN (403) with its own code', async () => {
    const res = await callRoute(mutating, { method: 'POST', body: {}, origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_ORIGIN_MISMATCH');
  });

  it('a matching cookie + header passes the double-submit', async () => {
    const res = await callRoute(mutating, { method: 'POST', body: {}, cookies: { ragab_csrf: 'tok-123' }, csrfToken: 'tok-123' });
    expect(res.status).toBe(200);
  });

  it('a signed-in read without a session is UNAUTHENTICATED (401)', async () => {
    const res = await callRoute(signedInRead, {});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('a staff endpoint: 401 without a session, 403 for a customer, 200 for staff', async () => {
    expect((await callRoute(staffOnly, {})).status).toBe(401);
    const customer = await sessionFor('01011111111', 'Customer@123');
    const denied = await callRoute(staffOnly, { cookies: customer });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
    const admin = await sessionFor('01000000000', 'Admin@12345');
    expect((await callRoute(staffOnly, { cookies: admin })).status).toBe(200);
  });
});
