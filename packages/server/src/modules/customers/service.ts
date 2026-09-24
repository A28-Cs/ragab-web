/**
 * Customers admin (§43). Customers are `users` with isStaff=false. Listing joins the
 * profile for spend/order aggregates. All operations require a customers permission
 * (enforced at the route) and block/unblock is audited.
 */
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { users, profiles } from '../../db/schema';
import { NotFoundError } from '../../lib/errors';
import { buildPage, decodeCursor, type Page } from '../../lib/pagination';
import { toLegacyDate } from '../../lib/clock';
import type { RequestContext } from '../../http/context';
import { logAudit } from '../audit';
import type { Customer } from '../../types';

type Row = { id: string; name: string; phone: string; email: string | null; village: string; status: string; createdAt: Date; ordersCount: string | null; totalSpent: string | null };

function toDto(r: Row): Customer {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email ?? undefined,
    village: r.village,
    ordersCount: Number(r.ordersCount ?? 0),
    totalSpent: Number(r.totalSpent ?? 0) / 100,
    joinedAt: toLegacyDate(r.createdAt),
    status: r.status === 'disabled' || r.status === 'suspended' ? 'blocked' : 'active',
  };
}

export async function listCustomers(_ctx: RequestContext, opts: { limit: number; cursor?: string; search?: string }): Promise<Page<Customer>> {
  const conds = [eq(users.isStaff, false)];
  if (opts.search) conds.push(or(ilike(users.name, `%${opts.search}%`), ilike(users.phone, `%${opts.search}%`))!);
  const cursor = decodeCursor(opts.cursor);
  if (cursor) conds.push(sql`${users.id} < ${cursor}`);

  const rows = await db()
    .select({
      id: users.id, name: users.name, phone: users.phone, email: users.email,
      village: users.defaultVillage, status: users.status, createdAt: users.createdAt,
      ordersCount: profiles.ordersCount, totalSpent: profiles.totalSpentMinor,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(and(...conds))
    .orderBy(desc(users.id))
    .limit(opts.limit + 1);
  const page = buildPage(rows as Row[], opts.limit, (r) => r.id);
  return { items: page.items.map(toDto), nextCursor: page.nextCursor, hasMore: page.hasMore };
}

export async function setCustomerStatus(ctx: RequestContext, id: string, blocked: boolean): Promise<Customer> {
  const [existing] = await db().select().from(users).where(and(eq(users.id, id), eq(users.isStaff, false))).limit(1);
  if (!existing) throw new NotFoundError({ code: 'CUSTOMER_NOT_FOUND', message: { ar: 'العميل غير موجود.', en: 'Customer not found.' } });
  await db().update(users).set({ status: blocked ? 'disabled' : 'active' }).where(eq(users.id, id));
  await logAudit({
    actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff',
    action: 'customer_updated', resource: 'customers', resourceId: id, metadata: { blocked: String(blocked) }, requestId: ctx.requestId,
  });
  const [row] = await db()
    .select({ id: users.id, name: users.name, phone: users.phone, email: users.email, village: users.defaultVillage, status: users.status, createdAt: users.createdAt, ordersCount: profiles.ordersCount, totalSpent: profiles.totalSpentMinor })
    .from(users).leftJoin(profiles, eq(profiles.userId, users.id)).where(eq(users.id, id)).limit(1);
  return toDto(row as Row);
}
