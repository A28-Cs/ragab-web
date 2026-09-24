/**
 * Admin order-detail screen support: `GET /admin/orders/:id` returns items + the
 * customer's house photo + any assigned courier, and `PATCH .../courier` records who
 * is delivering it (no driver-account system, just a name + phone on `shipments`).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { defineRoute } from '../../http/handler';
import { callRoute } from '../../test/http';
import { withTriggersDisabled } from '../../test/db';
import { db, closeDb } from '../../db/client';
import { orders, orderItems, shipments, users } from '../../db/schema';
import { SESSION_COOKIE } from '../../security/session';
import { CSRF_COOKIE } from '../../security/csrf';
import { authService, loginSchema } from '../auth';
import { orderService, assignCourierSchema } from '.';

const loginRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: loginSchema, handler: ({ body, ctx }) => authService.login(body, ctx) });
const detailRoute = defineRoute({
  method: 'GET',
  permission: { resource: 'orders', action: 'view' },
  paramsSchema: z.object({ id: z.string() }),
  handler: ({ params, ctx }) => orderService.getOrderDetailForStaff(ctx, params.id),
});
const courierRoute = defineRoute({
  method: 'PATCH',
  permission: { resource: 'orders', action: 'edit' },
  paramsSchema: z.object({ id: z.string() }),
  bodySchema: assignCourierSchema,
  handler: ({ params, body, ctx }) => orderService.assignCourier(ctx, params.id, body),
});

const ORDER_NUMBER = 'MHS-DETAILTEST-1';
const CUSTOMER_ID = 'user_demo';
const HOUSE_IMAGE = 'https://cdn.example.com/house-photos/img_detailtest.jpg';
let admin: Record<string, string>;
let orderId: string;

async function reset() {
  await withTriggersDisabled(async () => {
    if (orderId) await db().delete(shipments).where(eq(shipments.orderId, orderId));
    await db().delete(orders).where(eq(orders.orderNumber, ORDER_NUMBER));
  });
}

beforeAll(async () => {
  const [existing] = await db().select({ id: orders.id }).from(orders).where(eq(orders.orderNumber, ORDER_NUMBER)).limit(1);
  if (existing) orderId = existing.id;
  await reset();

  const [inserted] = await db()
    .insert(orders)
    .values({
      orderNumber: ORDER_NUMBER,
      userId: CUSTOMER_ID,
      paymentMethod: 'cod',
      subtotalMinor: 27000,
      deliveryFeeMinor: 1500,
      totalMinor: 28500,
      deliveryAddress: { recipientName: 'مختبر التفاصيل', phone: '01099887766', village: 'عليم', street: 'شارع 1' },
    })
    .returning({ id: orders.id });
  orderId = inserted!.id;
  await db().insert(orderItems).values({
    orderId, productNameAr: 'أرز مصري فاخر', unit: '5 كجم', quantity: 2, unitPriceMinor: 13500, lineTotalMinor: 27000,
  });
  await db().update(users).set({ houseImage: HOUSE_IMAGE }).where(eq(users.id, CUSTOMER_ID));

  const login = await callRoute(loginRoute, { method: 'POST', body: { identifier: '01000000000', password: 'Admin@12345' } });
  admin = { [SESSION_COOKIE]: login.cookies[SESSION_COOKIE]!, [CSRF_COOKIE]: login.cookies[CSRF_COOKIE]! };
});

afterAll(async () => {
  await db().update(users).set({ houseImage: null }).where(eq(users.id, CUSTOMER_ID));
  await reset();
  await closeDb();
});

describe('admin order detail (integration)', () => {
  it('returns items and the customer house photo, with no courier yet', async () => {
    const res = await callRoute(detailRoute, { cookies: admin, params: { id: orderId } });
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].productNameAr).toBe('أرز مصري فاخر');
    expect(res.body.data.items[0].quantity).toBe(2);
    expect(res.body.data.customerHouseImage).toBe(HOUSE_IMAGE);
    expect(res.body.data.courier).toBeUndefined();
  });

  it('also resolves by order number, same as the customer-facing route', async () => {
    const res = await callRoute(detailRoute, { cookies: admin, params: { id: ORDER_NUMBER } });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(orderId);
  });

  it('assigning a courier makes it show up on the next detail read', async () => {
    const assign = await callRoute(courierRoute, {
      method: 'PATCH',
      cookies: admin,
      csrfToken: admin[CSRF_COOKIE],
      params: { id: orderId },
      body: { driverName: 'محمد الراجحي', driverPhone: '01055443322' },
    });
    expect(assign.status).toBe(200);
    expect(assign.body.data.courier).toEqual({ driverName: 'محمد الراجحي', driverPhone: '01055443322', status: 'assigned' });

    const detail = await callRoute(detailRoute, { cookies: admin, params: { id: orderId } });
    expect(detail.body.data.courier.driverName).toBe('محمد الراجحي');
  });

  it('reassigning updates the same shipment rather than creating a second one', async () => {
    await callRoute(courierRoute, {
      method: 'PATCH', cookies: admin, csrfToken: admin[CSRF_COOKIE], params: { id: orderId },
      body: { driverName: 'كريم سعيد', driverPhone: '01011223344' },
    });
    const rows = await db().select().from(shipments).where(eq(shipments.orderId, orderId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.driverName).toBe('كريم سعيد');
  });

  it('rejects an anonymous caller (401), never confirming the order exists', async () => {
    const res = await callRoute(detailRoute, { params: { id: orderId } });
    expect(res.status).toBe(401);
  });
});
