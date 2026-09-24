/**
 * Phase 8 — the admin orders listing filters and counts on the SERVER: `q` matches the
 * order number, the recipient name or the phone; `total` is the count of matching rows
 * (cursor excluded) so the control center's "N results" is the truth (AC-23).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { defineRoute } from '../../http/handler';
import { callRoute } from '../../test/http';
import { withTriggersDisabled } from '../../test/db';
import { db, closeDb } from '../../db/client';
import { orders } from '../../db/schema';
import { SESSION_COOKIE } from '../../security/session';
import { authService, loginSchema } from '../auth';
import { orderService, orderListSchema } from '.';

const loginRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: loginSchema, handler: ({ body, ctx }) => authService.login(body, ctx) });
const listRoute = defineRoute({
  method: 'GET',
  permission: { resource: 'orders', action: 'view' },
  querySchema: orderListSchema,
  handler: ({ query, ctx }) => orderService.listAllOrders(ctx, query),
});

const ORDER_NUMBER = 'MHS-PAGETEST-1';
const PHONE = '01099887766';
let admin: Record<string, string>;

async function reset() {
  await withTriggersDisabled(async () => {
    await db().delete(orders).where(eq(orders.orderNumber, ORDER_NUMBER));
  });
}

beforeAll(async () => {
  await reset();
  await db().insert(orders).values({
    orderNumber: ORDER_NUMBER,
    paymentMethod: 'cod',
    subtotalMinor: 9500,
    deliveryFeeMinor: 1500,
    totalMinor: 11000,
    deliveryAddress: { recipientName: 'مختبر التصفح', phone: PHONE, village: 'عليم', street: 'شارع 1' },
  });
  const login = await callRoute(loginRoute, { method: 'POST', body: { identifier: '01000000000', password: 'Admin@12345' } });
  admin = { [SESSION_COOKIE]: login.cookies[SESSION_COOKIE]! };
});

afterAll(async () => {
  await reset();
  await closeDb();
});

describe('admin orders listing (integration)', () => {
  it('q matches the order number and reports the matching total', async () => {
    const res = await callRoute(listRoute, { cookies: admin, query: { q: 'pagetest', limit: '5' } });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items.map((o: { orderNumber: string }) => o.orderNumber)).toEqual([ORDER_NUMBER]);
    expect(res.body.data.hasMore).toBe(false);
  });

  it('q matches the recipient phone inside the delivery snapshot', async () => {
    const res = await callRoute(listRoute, { cookies: admin, query: { q: PHONE } });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.items.some((o: { orderNumber: string }) => o.orderNumber === ORDER_NUMBER)).toBe(true);
  });

  it('total counts every matching row while the page stays bounded', async () => {
    const res = await callRoute(listRoute, { cookies: admin, query: { limit: '1' } });
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.hasMore).toBe(res.body.data.total > 1);
    if (res.body.data.hasMore) expect(typeof res.body.data.nextCursor).toBe('string');
  });

  it('a nonsense q yields an empty page with total 0 (no client-side guessing)', async () => {
    const res = await callRoute(listRoute, { cookies: admin, query: { q: 'zzz-no-such-order-zzz' } });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.items).toEqual([]);
  });
});
