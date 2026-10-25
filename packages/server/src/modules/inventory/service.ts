/**
 * Inventory service (§7). Stock is held per VARIANT (piece / box / weight — migration
 * 0007); a product is the grouping. The reservation primitive is a single atomic UPDATE
 * whose WHERE clause is the availability guard:
 *
 *   UPDATE inventory_items SET quantity_reserved = quantity_reserved + qty
 *   WHERE variant_id = ? AND quantity_on_hand - quantity_reserved >= qty
 *
 * Zero rows affected ⇒ insufficient stock. No SELECT ... FOR UPDATE needed: the row
 * lock the UPDATE takes plus the CHECK constraint (quantity_on_hand >= quantity_reserved)
 * make overselling impossible even under N concurrent checkouts. Multi-item requests
 * are sorted by variant_id for a deterministic lock order (no deadlocks). Every change
 * appends an immutable stock_movements row.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { DbExecutor, Transaction } from '../../db/client';
import { db } from '../../db/client';
import { inventoryItems, productVariants, stockReservations, stockMovements, inventoryAdjustments, products, categories, productRequests } from '../../db/schema';
import { DEFAULT_WAREHOUSE_ID } from '../../db/schema/inventory';
import { BusinessRuleError, NotFoundError } from '../../lib/errors';
import { prefixedId } from '../../lib/ids';
import type { RequestContext } from '../../http/context';
import { logAudit } from '../audit';
import { publishEvent } from '../../lib/events';
import type { ProductRequest, ProductRequestStatus } from '@ragab/types';

export interface ReserveLine {
  productId: string;
  /** The stocked unit. Callers that only know the product resolve it via `defaultVariantIdFor`. */
  variantId: string;
  quantity: number;
}

export class InsufficientStockError extends BusinessRuleError {
  constructor(productId: string, variantId?: string) {
    super({
      code: 'INSUFFICIENT_STOCK',
      message: { ar: 'الكمية المطلوبة غير متوفرة في المخزون.', en: 'The requested quantity is not available in stock.' },
      meta: { productId, ...(variantId ? { variantId } : {}) },
    });
  }
}

const RESERVATION_TTL_MS = 30 * 60 * 1000; // hold stock for 30 minutes

/** The product's default variant id — what a client that does not know variants means by "the product". */
export async function defaultVariantIdFor(productId: string, exec: DbExecutor = db()): Promise<string | null> {
  const [row] = await exec
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(and(eq(productVariants.productId, productId), eq(productVariants.isDefault, true)))
    .limit(1);
  return row?.id ?? null;
}

/** Inventory row predicate: by variant when known, else the product's default variant. */
function inventoryRowWhere(productId: string, variantId?: string | null) {
  if (variantId) return eq(inventoryItems.variantId, variantId);
  return and(
    eq(inventoryItems.productId, productId),
    sql`${inventoryItems.variantId} = (SELECT id FROM product_variants WHERE product_id = ${productId} AND is_default LIMIT 1)`,
  )!;
}

/**
 * Reserve stock for a set of lines atomically. MUST run inside the caller's transaction
 * (checkout) so it commits together with the order. Returns the reservation ids.
 */
export async function reserveStock(
  tx: Transaction,
  lines: ReserveLine[],
  ref: { orderId?: string; cartId?: string },
  expiresAt = new Date(Date.now() + RESERVATION_TTL_MS),
): Promise<string[]> {
  // Deterministic lock order eliminates deadlocks between concurrent multi-item checkouts.
  const ordered = [...lines].filter((l) => l.quantity > 0).sort((a, b) => a.variantId.localeCompare(b.variantId));
  const reservationIds: string[] = [];

  for (const line of ordered) {
    const updated = await tx
      .update(inventoryItems)
      .set({ quantityReserved: sql`${inventoryItems.quantityReserved} + ${line.quantity}`, version: sql`${inventoryItems.version} + 1` })
      .where(
        and(
          eq(inventoryItems.variantId, line.variantId),
          sql`${inventoryItems.quantityOnHand} - ${inventoryItems.quantityReserved} >= ${line.quantity}`,
        ),
      )
      .returning({ id: inventoryItems.id, warehouseId: inventoryItems.warehouseId });

    if (updated.length === 0) {
      // No row satisfied the guard → not enough available. Roll back the whole tx.
      throw new InsufficientStockError(line.productId, line.variantId);
    }

    const resId = prefixedId('resv');
    await tx.insert(stockReservations).values({
      id: resId,
      productId: line.productId,
      variantId: line.variantId,
      warehouseId: updated[0]!.warehouseId,
      orderId: ref.orderId ?? null,
      cartId: ref.cartId ?? null,
      quantity: line.quantity,
      status: 'held',
      expiresAt,
    });
    await tx.insert(stockMovements).values({
      productId: line.productId,
      variantId: line.variantId,
      warehouseId: updated[0]!.warehouseId,
      type: 'reservation',
      quantityDelta: 0, // reservation does not change on-hand, only reserved
      reason: 'stock reserved',
      referenceType: ref.orderId ? 'order' : 'cart',
      referenceId: ref.orderId ?? ref.cartId ?? null,
    });
    reservationIds.push(resId);
  }

  return reservationIds;
}

/**
 * Commit an order's held reservations into an actual sale: on_hand -= qty, reserved -= qty.
 * Called when payment succeeds / COD confirmed. Idempotent per reservation (only 'held' move).
 */
export async function commitReservationsForOrder(tx: Transaction, orderId: string): Promise<void> {
  const held = await tx.select().from(stockReservations).where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, 'held')));
  if (held.length === 0) return;

  await Promise.all(held.map(r => 
    tx.update(inventoryItems)
      .set({
        quantityOnHand: sql`${inventoryItems.quantityOnHand} - ${r.quantity}`,
        quantityReserved: sql`${inventoryItems.quantityReserved} - ${r.quantity}`,
        version: sql`${inventoryItems.version} + 1`,
      })
      .where(inventoryRowWhere(r.productId, r.variantId))
  ));

  await tx.update(stockReservations)
    .set({ status: 'committed' })
    .where(inArray(stockReservations.id, held.map(r => r.id)));

  await tx.insert(stockMovements).values(held.map(r => ({
    productId: r.productId, variantId: r.variantId, warehouseId: r.warehouseId, type: 'sale' as const,
    quantityDelta: -r.quantity, reason: 'order fulfilled', referenceType: 'order', referenceId: orderId,
  })));
}

/** Release an order's held reservations (cancel/expire/payment-failed): reserved -= qty. */
export async function releaseReservationsForOrder(exec: DbExecutor, orderId: string): Promise<void> {
  const held = await exec.select().from(stockReservations).where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, 'held')));
  if (held.length === 0) return;

  await Promise.all(held.map(r => 
    exec.update(inventoryItems)
      .set({ quantityReserved: sql`GREATEST(${inventoryItems.quantityReserved} - ${r.quantity}, 0)`, version: sql`${inventoryItems.version} + 1` })
      .where(inventoryRowWhere(r.productId, r.variantId))
  ));

  await exec.update(stockReservations)
    .set({ status: 'released', releasedAt: new Date() })
    .where(inArray(stockReservations.id, held.map(r => r.id)));

  await exec.insert(stockMovements).values(held.map(r => ({
    productId: r.productId, variantId: r.variantId, warehouseId: r.warehouseId, type: 'reservation_release' as const,
    quantityDelta: 0, reason: 'reservation released', referenceType: 'order', referenceId: orderId,
  })));
}

/** Restock on refund/return: on_hand += qty (compensating movement). */
export async function restockForOrder(tx: Transaction, orderId: string, lines: ReserveLine[]): Promise<void> {
  if (lines.length === 0) return;

  await Promise.all(lines.map(line => 
    tx.update(inventoryItems)
      .set({ quantityOnHand: sql`${inventoryItems.quantityOnHand} + ${line.quantity}`, version: sql`${inventoryItems.version} + 1` })
      .where(inventoryRowWhere(line.productId, line.variantId))
  ));

  await tx.insert(stockMovements).values(lines.map(line => ({
    productId: line.productId, variantId: line.variantId, warehouseId: DEFAULT_WAREHOUSE_ID, type: 'refund_restock' as const,
    quantityDelta: line.quantity, reason: 'refund restock', referenceType: 'order', referenceId: orderId,
  })));
}

/** Release reservations whose hold expired (called by the BullMQ sweeper). */
export async function releaseExpiredReservations(now = new Date()): Promise<number> {
  return db().transaction(async (tx) => {
    const expired = await tx
      .select()
      .from(stockReservations)
      .where(and(eq(stockReservations.status, 'held'), sql`${stockReservations.expiresAt} < ${now}`))
      .limit(500);

    if (expired.length === 0) return 0;

    await Promise.all(expired.map(r => 
      tx.update(inventoryItems)
        .set({ quantityReserved: sql`GREATEST(${inventoryItems.quantityReserved} - ${r.quantity}, 0)`, version: sql`${inventoryItems.version} + 1` })
        .where(inventoryRowWhere(r.productId, r.variantId))
    ));

    await tx.update(stockReservations)
      .set({ status: 'expired', releasedAt: new Date() })
      .where(inArray(stockReservations.id, expired.map(r => r.id)));

    await tx.insert(stockMovements).values(expired.map(r => ({
      productId: r.productId, variantId: r.variantId, warehouseId: r.warehouseId, type: 'reservation_release' as const,
      quantityDelta: 0, reason: 'reservation expired', referenceType: 'reservation', referenceId: r.id,
    })));

    return expired.length;
  });
}

// ---- Admin ----

/**
 * Set a variant's on-hand quantity (absolute). `variantId` omitted = the product's default
 * variant, so the pre-variant admin screens keep working unchanged.
 */
export async function adjustStock(
  productId: string,
  newQuantity: number,
  reason: string,
  ctx: RequestContext,
  variantId?: string,
): Promise<{ productId: string; variantId: string; quantityOnHand: number }> {
  const result = await db().transaction(async (tx) => {
    // Row lock: two staff saving at once serialize here, so the delta written to the
    // ledger is computed from the value the write actually replaced (no lost update).
    const [inv] = await tx.select().from(inventoryItems).where(inventoryRowWhere(productId, variantId)).limit(1).for('update');
    if (!inv) throw new NotFoundError({ code: 'INVENTORY_NOT_FOUND', message: { ar: 'المنتج غير موجود بالمخزون.', en: 'Inventory record not found.' } });
    if (newQuantity < inv.quantityReserved) {
      throw new BusinessRuleError({
        code: 'STOCK_BELOW_RESERVED',
        message: { ar: 'لا يمكن خفض المخزون دون الكمية المحجوزة.', en: 'Cannot set stock below the reserved quantity.' },
        meta: { reserved: inv.quantityReserved },
      });
    }
    const delta = newQuantity - inv.quantityOnHand;
    await tx.update(inventoryItems).set({ quantityOnHand: newQuantity, version: sql`${inventoryItems.version} + 1` }).where(eq(inventoryItems.id, inv.id));
    await tx.insert(inventoryAdjustments).values({
      productId, variantId: inv.variantId, warehouseId: inv.warehouseId, previousQuantity: inv.quantityOnHand, newQuantity, reason, actorId: ctx.principal?.userId,
    });
    if (delta !== 0) {
      await tx.insert(stockMovements).values({
        productId, variantId: inv.variantId, warehouseId: inv.warehouseId, type: 'adjustment', quantityDelta: delta, reason, actorId: ctx.principal?.userId,
      });
    }
    return { productId, variantId: inv.variantId, quantityOnHand: newQuantity };
  });
  await logAudit({
    actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff',
    action: 'inventory_adjusted', resource: 'inventory', resourceId: productId,
    metadata: { variantId: result.variantId, newQuantity: String(newQuantity), reason }, requestId: ctx.requestId,
  });
  return result;
}

export async function bulkAdjustStock(
  input: {
    quantity: number;
    reason?: string;
    items?: Array<{ productId: string; variantId?: string }>;
    productIds?: string[];
    categoryId?: string;
  },
  ctx: RequestContext,
): Promise<{ count: number; updatedProducts: number }> {
  const { quantity, reason = 'bulk stock adjustment', categoryId } = input;

  let productIdsToUpdate: string[] = [];

  if (categoryId) {
    const children = await db()
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.parentId, categoryId), sql`${categories.deletedAt} IS NULL`));
    const catIds = [categoryId, ...children.map((c) => c.id)];

    const catProducts = await db()
      .select({ id: products.id })
      .from(products)
      .where(and(inArray(products.categoryId, catIds), sql`${products.deletedAt} IS NULL`));
    productIdsToUpdate = catProducts.map((p) => p.id);
  } else if (input.productIds && input.productIds.length > 0) {
    productIdsToUpdate = input.productIds;
  } else if (input.items && input.items.length > 0) {
    productIdsToUpdate = Array.from(new Set(input.items.map((it) => it.productId)));
  }

  if (productIdsToUpdate.length === 0) {
    return { count: 0, updatedProducts: 0 };
  }

  const allVariants = await db()
    .select({ id: productVariants.id, productId: productVariants.productId, isDefault: productVariants.isDefault })
    .from(productVariants)
    .where(inArray(productVariants.productId, productIdsToUpdate));

  let targetVariantEntries: Array<{ productId: string; variantId: string }> = [];
  if (input.items && input.items.length > 0 && input.items.some((it) => it.variantId)) {
    for (const it of input.items) {
      if (it.variantId) {
        targetVariantEntries.push({ productId: it.productId, variantId: it.variantId });
      } else {
        const def = allVariants.find((v) => v.productId === it.productId && v.isDefault) || allVariants.find((v) => v.productId === it.productId);
        if (def) targetVariantEntries.push({ productId: it.productId, variantId: def.id });
      }
    }
  } else {
    for (const v of allVariants) {
      targetVariantEntries.push({ productId: v.productId, variantId: v.id });
    }
  }

  if (targetVariantEntries.length === 0) {
    return { count: 0, updatedProducts: 0 };
  }

  const distinctProductIds = new Set(targetVariantEntries.map((e) => e.productId));
  const variantIds = targetVariantEntries.map((e) => e.variantId);

  // Fetch existing inventory rows
  const existingInv = await db()
    .select()
    .from(inventoryItems)
    .where(inArray(inventoryItems.variantId, variantIds));

  const existingMap = new Map(existingInv.map((inv) => [inv.variantId, inv]));

  await db().transaction(async (tx) => {
    for (const entry of targetVariantEntries) {
      const inv = existingMap.get(entry.variantId);
      if (!inv) {
        await tx.insert(inventoryItems).values({
          id: prefixedId('inv'),
          productId: entry.productId,
          variantId: entry.variantId,
          warehouseId: DEFAULT_WAREHOUSE_ID,
          quantityOnHand: quantity,
          quantityReserved: 0,
        });
        await tx.insert(stockMovements).values({
          productId: entry.productId,
          variantId: entry.variantId,
          warehouseId: DEFAULT_WAREHOUSE_ID,
          type: 'adjustment',
          quantityDelta: quantity,
          reason,
          actorId: ctx.principal?.userId,
        });
      } else {
        const safeQuantity = Math.max(quantity, inv.quantityReserved);
        const delta = safeQuantity - inv.quantityOnHand;
        await tx
          .update(inventoryItems)
          .set({ quantityOnHand: safeQuantity, version: sql`${inventoryItems.version} + 1` })
          .where(eq(inventoryItems.id, inv.id));

        await tx.insert(inventoryAdjustments).values({
          productId: entry.productId,
          variantId: entry.variantId,
          warehouseId: inv.warehouseId,
          previousQuantity: inv.quantityOnHand,
          newQuantity: safeQuantity,
          reason,
          actorId: ctx.principal?.userId,
        });

        if (delta !== 0) {
          await tx.insert(stockMovements).values({
            productId: entry.productId,
            variantId: entry.variantId,
            warehouseId: inv.warehouseId,
            type: 'adjustment',
            quantityDelta: delta,
            reason,
            actorId: ctx.principal?.userId,
          });
        }
      }
    }
  });

  await logAudit({
    actorId: ctx.principal?.userId,
    actorName: ctx.principal?.user.name ?? 'system',
    actorRole: 'staff',
    action: 'inventory_adjusted',
    resource: 'inventory',
    resourceId: categoryId || 'bulk',
    metadata: {
      bulk: 'true',
      quantity: String(quantity),
      categoryId: categoryId || '',
      updatedCount: String(targetVariantEntries.length),
      reason,
    },
    requestId: ctx.requestId,
  });

  return {
    count: targetVariantEntries.length,
    updatedProducts: distinctProductIds.size,
  };
}

export async function getInventoryLevels(productIds?: string[]) {
  const q = db()
    .select({
      productId: inventoryItems.productId,
      variantId: inventoryItems.variantId,
      warehouseId: inventoryItems.warehouseId,
      onHand: inventoryItems.quantityOnHand,
      reserved: inventoryItems.quantityReserved,
      available: sql<number>`(${inventoryItems.quantityOnHand} - ${inventoryItems.quantityReserved})::int`,
    })
    .from(inventoryItems);
  const rows = productIds?.length ? await q.where(inArray(inventoryItems.productId, productIds)) : await q;
  return rows;
}

let productRequestsTableChecked = false;
async function ensureProductRequestsTable() {
  if (productRequestsTableChecked) return;
  try {
    await db().execute(sql`
      DO $$ BEGIN
        CREATE TYPE "product_request_status" AS ENUM('pending', 'fulfilled', 'cancelled');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
      CREATE TABLE IF NOT EXISTS "product_requests" (
        "id" text PRIMARY KEY,
        "product_id" text NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
        "variant_id" text,
        "product_name_ar" text NOT NULL,
        "product_name_en" text,
        "customer_name" text NOT NULL,
        "customer_phone" text NOT NULL,
        "user_id" text,
        "notes" text,
        "status" "product_request_status" NOT NULL DEFAULT 'pending',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    productRequestsTableChecked = true;
  } catch {
    // best-effort
  }
}

export async function createProductRequest(
  input: {
    productId: string;
    variantId?: string;
    customerName: string;
    customerPhone: string;
    notes?: string;
  },
  ctx: RequestContext,
): Promise<{ ok: boolean; id: string }> {
  await ensureProductRequestsTable();

  const [prod] = await db()
    .select({ id: products.id, nameAr: products.nameAr, nameEn: products.nameEn, image: products.image })
    .from(products)
    .where(eq(products.id, input.productId))
    .limit(1);

  if (!prod) {
    throw new NotFoundError({
      code: 'PRODUCT_NOT_FOUND',
      message: { ar: 'المنتج غير موجود.', en: 'Product not found.' },
    });
  }

  const id = prefixedId('preq');
  const userId = ctx.principal?.userId ?? null;

  await db().insert(productRequests).values({
    id,
    productId: input.productId,
    variantId: input.variantId ?? null,
    productNameAr: prod.nameAr,
    productNameEn: prod.nameEn ?? null,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    userId,
    notes: input.notes ?? null,
    status: 'pending',
  });

  await logAudit({
    actorId: userId,
    actorName: input.customerName,
    actorRole: 'customer',
    action: 'product_requested' as any,
    resource: 'inventory',
    resourceId: input.productId,
    target: `${prod.nameAr} - ${input.customerName} (${input.customerPhone})`,
    metadata: {
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      notes: input.notes || '',
      requestId: id,
    },
    requestId: ctx.requestId,
  });

  try {
    await publishEvent('admin_orders', {
      event: 'product.requested',
      topic: 'admin_orders',
      eventId: prefixedId('evt'),
      timestamp: new Date().toISOString(),
      version: 1,
      data: {
        requestId: id,
        productId: input.productId,
        productNameAr: prod.nameAr,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
      },
    });
  } catch {
    // Best-effort realtime publish
  }

  return { ok: true, id };
}

export async function listProductRequests(
  statusFilter?: string,
  _ctx?: RequestContext,
): Promise<ProductRequest[]> {
  await ensureProductRequestsTable();

  const query = db()
    .select({
      id: productRequests.id,
      productId: productRequests.productId,
      variantId: productRequests.variantId,
      productNameAr: productRequests.productNameAr,
      productNameEn: productRequests.productNameEn,
      customerName: productRequests.customerName,
      customerPhone: productRequests.customerPhone,
      userId: productRequests.userId,
      notes: productRequests.notes,
      status: productRequests.status,
      createdAt: productRequests.createdAt,
      updatedAt: productRequests.updatedAt,
      productImage: products.image,
      categoryNameAr: categories.nameAr,
    })
    .from(productRequests)
    .innerJoin(products, eq(productRequests.productId, products.id))
    .leftJoin(categories, eq(products.categoryId, categories.id));

  const rows = statusFilter && statusFilter !== 'all'
    ? await query.where(eq(productRequests.status, statusFilter as any)).orderBy(desc(productRequests.createdAt)).limit(100)
    : await query.orderBy(desc(productRequests.createdAt)).limit(100);

  return rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    variantId: r.variantId ?? undefined,
    productNameAr: r.productNameAr,
    productNameEn: r.productNameEn ?? undefined,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    userId: r.userId ?? undefined,
    notes: r.notes ?? undefined,
    status: r.status as ProductRequestStatus,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    productImage: r.productImage ?? undefined,
    categoryNameAr: r.categoryNameAr ?? undefined,
  }));
}

export async function updateProductRequestStatus(
  id: string,
  status: ProductRequestStatus,
  ctx: RequestContext,
): Promise<{ ok: boolean }> {
  await ensureProductRequestsTable();

  const [existing] = await db()
    .select()
    .from(productRequests)
    .where(eq(productRequests.id, id))
    .limit(1);

  if (!existing) {
    throw new NotFoundError({
      code: 'REQUEST_NOT_FOUND',
      message: { ar: 'طلب المنتج غير موجود.', en: 'Product request not found.' },
    });
  }

  await db()
    .update(productRequests)
    .set({ status, updatedAt: new Date() })
    .where(eq(productRequests.id, id));

  await logAudit({
    actorId: ctx.principal?.userId,
    actorName: ctx.principal?.user.name ?? 'system',
    actorRole: 'staff',
    action: 'inventory_adjusted',
    resource: 'inventory',
    resourceId: existing.productId,
    target: `${existing.productNameAr} - status -> ${status}`,
    metadata: { requestId: id, status },
    requestId: ctx.requestId,
  });

  return { ok: true };
}
