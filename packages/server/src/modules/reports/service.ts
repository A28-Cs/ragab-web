/**
 * Reports (§45) — the ONE source of truth for every financial number the dashboards show.
 * Web and mobile render this; nothing re-aggregates client-side. Two measures are kept
 * apart on purpose:
 *   booked sales  — order totals for orders that were not cancelled
 *   collected     — money actually captured (gross), refunded, and net = gross − refunded
 * A fully refunded payment stays in gross AND shows in refunds, so net is 0 — never
 * negative. Aggregates are bounded SQL; the date range is optional (all-time by default).
 */
import { and, desc, eq, gte, inArray, lte, ne, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client';
import { orders, orderItems, payments, products, categories } from '../../db/schema';
import { Money } from '../../lib/money';
import type { CollectedTotals, SalesReport } from '../../types';

export interface ReportRange {
  from?: Date;
  to?: Date;
}

/** Payment rows that represent money the store actually received at some point. */
const CAPTURED_STATUSES = ['paid', 'refunded', 'partially_refunded'] as const;
const ORDER_STATUSES = ['pending', 'preparing', 'on_the_way', 'delivered', 'cancelled'] as const;

function orderRangeConds(range: ReportRange): SQL[] {
  const conds: SQL[] = [];
  if (range.from) conds.push(gte(orders.placedAt, range.from));
  if (range.to) conds.push(lte(orders.placedAt, range.to));
  return conds;
}

function paymentRangeConds(range: ReportRange): SQL[] {
  const conds: SQL[] = [];
  if (range.from) conds.push(gte(payments.createdAt, range.from));
  if (range.to) conds.push(lte(payments.createdAt, range.to));
  return conds;
}

/** Postgres returns SUM/COUNT of bigint as strings — normalise, then project to major units. */
const major = (minor: unknown): number => Money.ofMinor(Number(minor ?? 0)).toMajor();

/** Captured / refunded / net — shared by the Payments page and the sales report. */
export async function collectedTotals(range: ReportRange = {}): Promise<CollectedTotals> {
  const [row] = await db()
    .select({
      gross: sql<string>`COALESCE(SUM(${payments.amountMinor}) FILTER (WHERE ${payments.status} IN ('paid', 'refunded', 'partially_refunded')), 0)`,
      refunded: sql<string>`COALESCE(SUM(${payments.refundedMinor}), 0)`,
      paidCount: sql<number>`COUNT(*) FILTER (WHERE ${payments.status} IN ('paid', 'refunded', 'partially_refunded'))::int`,
      pendingCount: sql<number>`COUNT(*) FILTER (WHERE ${payments.status} = 'pending')::int`,
    })
    .from(payments)
    .where(and(...paymentRangeConds(range)));
  const grossMinor = Number(row?.gross ?? 0);
  const refundedMinor = Number(row?.refunded ?? 0);
  return {
    gross: major(grossMinor),
    refunded: major(refundedMinor),
    net: major(grossMinor - refundedMinor),
    paidCount: row?.paidCount ?? 0,
    pendingCount: row?.pendingCount ?? 0,
  };
}

export async function salesReport(range: ReportRange = {}): Promise<SalesReport> {
  const oRange = orderRangeConds(range);
  const live = ne(orders.status, 'cancelled');

  const [[totals], byStatusRows, byCategoryRows, byMethodRows, topRows, collected] = await Promise.all([
    db()
      .select({
        orders: sql<number>`COUNT(*) FILTER (WHERE ${orders.status} <> 'cancelled')::int`,
        cancelled: sql<number>`COUNT(*) FILTER (WHERE ${orders.status} = 'cancelled')::int`,
        sales: sql<string>`COALESCE(SUM(${orders.totalMinor}) FILTER (WHERE ${orders.status} <> 'cancelled'), 0)`,
        customers: sql<number>`COUNT(DISTINCT ${orders.userId}) FILTER (WHERE ${orders.status} <> 'cancelled')::int`,
      })
      .from(orders)
      .where(and(...oRange)),
    db()
      .select({ status: orders.status, count: sql<number>`COUNT(*)::int` })
      .from(orders)
      .where(and(...oRange))
      .groupBy(orders.status),
    // Category revenue comes from the item snapshots joined to the CURRENT product →
    // category (a deleted product lands in "uncategorised" rather than vanishing).
    db()
      .select({
        categoryId: categories.id,
        nameAr: categories.nameAr,
        nameEn: categories.nameEn,
        revenue: sql<string>`COALESCE(SUM(${orderItems.lineTotalMinor}), 0)`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .leftJoin(products, eq(orderItems.productId, products.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(and(live, ...oRange))
      .groupBy(categories.id, categories.nameAr, categories.nameEn)
      .orderBy(desc(sql`SUM(${orderItems.lineTotalMinor})`))
      .limit(8),
    db()
      .select({ method: payments.method, revenue: sql<string>`COALESCE(SUM(${payments.amountMinor}), 0)` })
      .from(payments)
      .where(and(inArray(payments.status, [...CAPTURED_STATUSES]), ...paymentRangeConds(range)))
      .groupBy(payments.method),
    db()
      .select({
        productId: orderItems.productId,
        nameAr: sql<string>`MAX(${orderItems.productNameAr})`,
        quantity: sql<number>`SUM(${orderItems.quantity})::int`,
        revenue: sql<string>`SUM(${orderItems.lineTotalMinor})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(live, ...oRange))
      .groupBy(orderItems.productId)
      .orderBy(desc(sql`SUM(${orderItems.quantity})`))
      .limit(10),
    collectedTotals(range),
  ]);

  const salesMinor = Number(totals?.sales ?? 0);
  const orderCount = totals?.orders ?? 0;
  const countByStatus = new Map(byStatusRows.map((r) => [r.status, r.count]));

  return {
    range: { from: range.from?.toISOString(), to: range.to?.toISOString() },
    totalOrders: orderCount,
    cancelledOrders: totals?.cancelled ?? 0,
    salesTotal: major(salesMinor),
    averageOrderValue: orderCount > 0 ? major(Math.round(salesMinor / orderCount)) : 0,
    customers: totals?.customers ?? 0,
    collected,
    totalRevenue: collected.gross,
    byStatus: ORDER_STATUSES.map((status) => ({ status, count: countByStatus.get(status) ?? 0 })),
    byCategory: byCategoryRows.map((r) => ({
      categoryId: r.categoryId ?? '',
      nameAr: r.nameAr ?? 'غير مصنّف',
      nameEn: r.nameEn ?? 'Uncategorised',
      revenue: major(r.revenue),
    })),
    byMethod: byMethodRows.map((r) => ({ method: r.method, revenue: major(r.revenue) })),
    topProducts: topRows.map((r) => ({ productId: r.productId ?? '', nameAr: r.nameAr, quantity: r.quantity, revenue: major(r.revenue) })),
  };
}
