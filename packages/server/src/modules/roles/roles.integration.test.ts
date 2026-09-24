/**
 * Three roles (migration 0009): the database state equals the code constants, nobody is
 * left on a retired role, and the bundles actually gate what they claim to gate.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { z } from 'zod';
import { eq, inArray, sql } from 'drizzle-orm';
import { defineRoute } from '../../http/handler';
import { callRoute } from '../../test/http';
import { db, closeDb } from '../../db/client';
import { roles, users, sessions } from '../../db/schema';
import { SESSION_COOKIE } from '../../security/session';
import { hashPassword } from '../../security/password';
import { DEFAULT_ROLES, expandPermissions } from '../../security/permissions';
import { authService, loginSchema } from '../auth';
import { listRoles } from './service';
import { refundService, refundSchema } from '../refunds';
import { orderService } from '../orders';

const loginRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: loginSchema, handler: ({ body, ctx }) => authService.login(body, ctx) });
const rolesRoute = defineRoute({ method: 'GET', permission: { resource: 'roles', action: 'view' }, handler: () => listRoles() });
const refundRoute = defineRoute({ method: 'POST', csrf: false, permission: { resource: 'payments', action: 'approve' }, bodySchema: refundSchema, handler: ({ body, ctx }) => refundService.issueRefund(ctx, body) });
const statusRoute = defineRoute({ method: 'PATCH', csrf: false, permission: { resource: 'orders', action: 'edit' }, paramsSchema: z.object({ id: z.string() }), bodySchema: z.object({ status: z.enum(['pending', 'preparing', 'on_the_way', 'delivered', 'cancelled']) }), handler: ({ params, body, ctx }) => orderService.updateOrderStatus(ctx, params.id, body.status) });

const STAFF_PHONE = '01077665500';
const STAFF_ID = 'user_roles_test_staff';

async function sessionFor(phone: string, password: string): Promise<Record<string, string>> {
  const res = await callRoute(loginRoute, { method: 'POST', body: { identifier: phone, password } });
  return { [SESSION_COOKIE]: res.cookies[SESSION_COOKIE]! };
}

describe('three roles (integration)', () => {
  beforeAll(async () => {
    await cleanup();
    await db().insert(users).values({
      id: STAFF_ID, name: 'موظف اختبار', phone: STAFF_PHONE, email: 'roles-test@ragab.sa',
      passwordHash: await hashPassword('Staff@12345'), defaultVillage: 'قرية عليم',
      status: 'active', emailVerified: true, phoneVerified: true, isStaff: true, roleId: 'role_staff',
    });
  });
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('the database holds exactly the three system roles with the permission bundles the code declares', async () => {
    const dbRoles = await listRoles();
    expect(dbRoles.filter((r) => r.isSystem).map((r) => r.id).sort()).toEqual(['role_owner', 'role_staff', 'role_store_manager']);
    for (const seed of DEFAULT_ROLES) {
      const row = dbRoles.find((r) => r.id === seed.id)!;
      expect(row, seed.id).toBeTruthy();
      expect([...expandPermissions(row.permissions)].sort(), seed.id).toEqual([...expandPermissions(seed.permissions)].sort());
    }
  });

  it('no user is left on a retired role, and the seeded owner still holds the wildcard', async () => {
    const retired = ['role_super_admin', 'role_product_manager', 'role_marketing_manager', 'role_finance', 'role_order_manager', 'role_inventory_manager', 'role_customer_support'];
    const stranded = await db().select({ id: users.id }).from(users).where(inArray(users.roleId, retired));
    expect(stranded).toEqual([]);
    const live = await db().select({ id: roles.id }).from(roles);
    const dangling = await db().select({ id: users.id }).from(users).where(sql`${users.roleId} IS NOT NULL AND ${users.roleId} NOT IN (${sql.join(live.map((r) => sql`${r.id}`), sql`, `)})`);
    expect(dangling).toEqual([]);
    const [owner] = await db().select({ roleId: users.roleId }).from(users).where(eq(users.phone, '01000000000')).limit(1);
    expect(owner!.roleId).toBe('role_owner');
    const admin = await sessionFor('01000000000', 'Admin@12345');
    expect((await callRoute(rolesRoute, { cookies: admin })).status).toBe(200);
  });

  it('staff can work orders but cannot see roles, refund, or approve delivery', async () => {
    const staff = await sessionFor(STAFF_PHONE, 'Staff@12345');
    expect((await callRoute(rolesRoute, { cookies: staff })).status).toBe(403);
    const refund = await callRoute(refundRoute, { method: 'POST', cookies: staff, body: { orderId: 'ord_none', reauthPassword: 'Staff@12345' } });
    expect(refund.status).toBe(403);
    // orders:edit is granted (the route lets them in); 'delivered' needs orders:approve → refused by the service.
    const deliver = await callRoute(statusRoute, { method: 'PATCH', cookies: staff, params: { id: 'ord_none' }, body: { status: 'delivered' } });
    expect(deliver.status).toBe(403);
    const prepare = await callRoute(statusRoute, { method: 'PATCH', cookies: staff, params: { id: 'ord_none' }, body: { status: 'preparing' } });
    expect(prepare.status).toBe(404); // past the permission gate → the order simply does not exist
  });
});

async function cleanup() {
  await db().delete(sessions).where(eq(sessions.userId, STAFF_ID)).catch(() => undefined);
  await db().delete(users).where(eq(users.id, STAFF_ID));
}
