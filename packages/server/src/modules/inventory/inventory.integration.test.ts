import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db, closeDb } from '../../db/client';
import { inventoryItems, stockReservations, stockMovements, inventoryAdjustments, products, productVariants, categories } from '../../db/schema';
import { and, eq } from 'drizzle-orm';
import type { RequestContext } from '../../http/context';
import { reserveStock, commitReservationsForOrder, releaseReservationsForOrder, adjustStock } from './service';
import { withTriggersDisabled } from '../../test/db';

/** adjustStock only reads the actor + request id off the context. */
const ADMIN_CTX = { principal: null, requestId: 'test-inventory' } as unknown as RequestContext;

const PID = 'prod_concurrency_test';
/** Stock is held per variant (0007); the single default variant stands for the product. */
const VID = `var_${PID}`;

async function ensureProduct(stock: number) {
  await db().insert(categories).values({ id: 'cat_test', slug: 'test', nameAr: 'ت', nameEn: 'T' }).onConflictDoNothing();
  await withTriggersDisabled(async (tx) => {
    await tx.delete(stockReservations).where(eq(stockReservations.productId, PID));
    await tx.delete(stockMovements).where(eq(stockMovements.productId, PID));
    await tx.delete(inventoryAdjustments).where(eq(inventoryAdjustments.productId, PID));
    await tx.delete(inventoryItems).where(eq(inventoryItems.productId, PID));
    await tx.delete(productVariants).where(eq(productVariants.productId, PID));
    await tx.delete(products).where(eq(products.id, PID));
  });
  await db().insert(products).values({ id: PID, sku: 'CONC-1', slug: PID, nameAr: 'اختبار', categoryId: 'cat_test', unitAr: '1', unitEn: '1', priceMinor: 1000 });
  await db().insert(productVariants).values({ id: VID, productId: PID, sku: 'CONC-1', nameAr: '1', nameEn: '1', priceMinor: 1000, isActive: true, isDefault: true, sortOrder: 0 });
  await db().insert(inventoryItems).values({ id: `inv_${PID}`, productId: PID, variantId: VID, quantityOnHand: stock, quantityReserved: 0 });
}

async function levels() {
  const [inv] = await db().select().from(inventoryItems).where(eq(inventoryItems.productId, PID)).limit(1);
  return inv!;
}

describe('inventory concurrency (integration) — the overselling defense', () => {
  afterAll(async () => {
    await withTriggersDisabled(async (tx) => {
      await tx.delete(stockReservations).where(eq(stockReservations.productId, PID));
      await tx.delete(stockMovements).where(eq(stockMovements.productId, PID));
      await tx.delete(inventoryAdjustments).where(eq(inventoryAdjustments.productId, PID));
      await tx.delete(inventoryItems).where(eq(inventoryItems.productId, PID));
      await tx.delete(productVariants).where(eq(productVariants.productId, PID));
      await tx.delete(products).where(eq(products.id, PID));
      await tx.delete(categories).where(eq(categories.id, 'cat_test'));
    });
    await closeDb();
  });

  it('10 concurrent reservations for 1 unit → exactly 1 succeeds, stock never negative', async () => {
    await ensureProduct(1);
    const attempts = Array.from({ length: 10 }, (_, i) =>
      db()
        .transaction((tx) => reserveStock(tx, [{ productId: PID, variantId: VID, quantity: 1 }], { orderId: `order_${i}` }))
        .then(() => 'ok' as const)
        .catch((e) => (e?.code === 'INSUFFICIENT_STOCK' ? ('fail' as const) : Promise.reject(e))),
    );
    const results = await Promise.all(attempts);
    const successes = results.filter((r) => r === 'ok').length;
    expect(successes).toBe(1);
    const inv = await levels();
    expect(inv.quantityReserved).toBe(1);
    expect(inv.quantityOnHand).toBe(1);
    expect(inv.quantityOnHand - inv.quantityReserved).toBe(0); // nothing left available
    expect(inv.quantityReserved).toBeLessThanOrEqual(inv.quantityOnHand); // CHECK invariant held
  });

  it('reserve → commit decrements on_hand and reserved (a real sale)', async () => {
    await ensureProduct(5);
    await db().transaction((tx) => reserveStock(tx, [{ productId: PID, variantId: VID, quantity: 3 }], { orderId: 'order_commit' }));
    let inv = await levels();
    expect(inv.quantityReserved).toBe(3);
    await db().transaction((tx) => commitReservationsForOrder(tx, 'order_commit'));
    inv = await levels();
    expect(inv.quantityOnHand).toBe(2);
    expect(inv.quantityReserved).toBe(0);
  });

  it('reserve → release returns stock to available', async () => {
    await ensureProduct(5);
    await db().transaction((tx) => reserveStock(tx, [{ productId: PID, variantId: VID, quantity: 4 }], { orderId: 'order_release' }));
    expect((await levels()).quantityReserved).toBe(4);
    await releaseReservationsForOrder(db(), 'order_release');
    const inv = await levels();
    expect(inv.quantityReserved).toBe(0);
    expect(inv.quantityOnHand).toBe(5);
  });

  it('20 concurrent reservations for 5 units → exactly 5 succeed', async () => {
    await ensureProduct(5);
    const attempts = Array.from({ length: 20 }, (_, i) =>
      db()
        .transaction((tx) => reserveStock(tx, [{ productId: PID, variantId: VID, quantity: 1 }], { orderId: `o_${i}` }))
        .then(() => 'ok' as const)
        .catch((e) => (e?.code === 'INSUFFICIENT_STOCK' ? ('fail' as const) : Promise.reject(e))),
    );
    const results = await Promise.all(attempts);
    expect(results.filter((r) => r === 'ok').length).toBe(5);
    const inv = await levels();
    expect(inv.quantityReserved).toBe(5);
  });

  it('concurrent absolute stock sets serialize: the ledger deltas replay to the final level (no lost update)', async () => {
    await ensureProduct(10);
    const targets = Array.from({ length: 10 }, (_, i) => 20 + i);
    await Promise.all(targets.map((q) => adjustStock(PID, q, 'race', ADMIN_CTX)));
    const inv = await levels();
    expect(targets).toContain(inv.quantityOnHand); // last writer wins, but it IS one of the writes
    const moves = await db().select().from(stockMovements).where(and(eq(stockMovements.productId, PID), eq(stockMovements.type, 'adjustment')));
    const replayed = moves.reduce((sum, m) => sum + m.quantityDelta, 0);
    expect(10 + replayed).toBe(inv.quantityOnHand); // every delta was computed against the value it replaced
  });

  it('refuses to set stock below the reserved quantity as a 422 business rule, not a raw CHECK violation', async () => {
    await ensureProduct(5);
    await db().transaction((tx) => reserveStock(tx, [{ productId: PID, variantId: VID, quantity: 3 }], { orderId: 'order_guard' }));
    await expect(adjustStock(PID, 2, 'too low', ADMIN_CTX)).rejects.toMatchObject({ code: 'STOCK_BELOW_RESERVED', httpStatus: 422 });
    expect((await levels()).quantityOnHand).toBe(5);
    // Exactly the reserved amount is the floor.
    await adjustStock(PID, 3, 'floor', ADMIN_CTX);
    expect((await levels()).quantityOnHand).toBe(3);
  });
});
