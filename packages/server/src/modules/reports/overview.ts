import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { orders, users, DEFAULT_STORE_ID } from '../../db/schema';
import { can, hasAnyAdminAccess } from '../../security/permissions';
import type { RequestContext } from '../../http/context';
import { AuthorizationError } from '../../lib/errors';
import { systemClock, type Clock } from '../../lib/clock';
import { countProducts } from '../catalog/repository';
import { collectedTotals } from './service';

/** A missing permission is null, never a fabricated zero. All aggregation stays on the server. */
export async function dashboardOverview(ctx: RequestContext, clock: Clock = systemClock) {
  const principal = ctx.principal;
  if (!principal?.user.isStaff || !hasAnyAdminAccess(principal.permissions)) throw new AuthorizationError({ message: { ar: 'غير مصرح', en: 'Staff access required.' } });
  const allowed = (resource: Parameters<typeof can>[1]) => can(principal.permissions, resource, 'view');
  const now = clock.now().toISOString();
  // Local midnight boundaries are converted separately, so Cairo DST days may be 23/25 hours.
  const midnight = sql`date_trunc('day', ${now}::timestamptz AT TIME ZONE 'Africa/Cairo')`;
  const [today, collected, customers, lowStock] = await Promise.all([
    allowed('orders') ? db().select({ count: sql<number>`count(*)::int` }).from(orders).where(and(
      eq(orders.storeId, DEFAULT_STORE_ID),
      sql`${orders.placedAt} >= (${midnight} AT TIME ZONE 'Africa/Cairo')`,
      sql`${orders.placedAt} < ((${midnight} + interval '1 day') AT TIME ZONE 'Africa/Cairo')`,
    )) : null,
    allowed('reports') ? collectedTotals() : null,
    allowed('customers') ? db().select({ count: sql<number>`count(*)::int` }).from(users).where(and(eq(users.storeId, DEFAULT_STORE_ID), eq(users.isStaff, false))) : null,
    allowed('inventory') ? countProducts({ lowStockOnly: true, limit: 1 }, { visibleOnly: false }) : null,
  ]);
  return {
    todayOrders: today?.[0]?.count ?? null,
    revenue: collected?.net ?? null,
    customers: customers?.[0]?.count ?? null,
    lowStock,
    timeZone: 'Africa/Cairo',
    asOf: now,
  };
}