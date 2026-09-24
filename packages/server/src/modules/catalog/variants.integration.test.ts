/**
 * Product variants (migration 0007): the variant is the sellable, stocked unit. The
 * migration leaves every product with one default variant; the admin can add piece/box
 * units with their own price and stock; the cart keeps a line per variant; checkout
 * snapshots the variant price/name and reserves THAT variant's stock; a retired variant
 * can no longer be bought.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { z } from 'zod';
import { eq, inArray, like, sql } from 'drizzle-orm';
import { defineRoute } from '../../http/handler';
import { callRoute, type CallResult } from '../../test/http';
import { withTriggersDisabled } from '../../test/db';
import { db, closeDb } from '../../db/client';
import {
  users, addresses, orders, orderItems, orderStatusHistory, stockReservations, stockMovements, inventoryAdjustments, inventoryItems,
  products, productVariants, payments, paymentIntents, paymentTransactions, carts, cartItems, notifications, emailEvents,
} from '../../db/schema';
import { SESSION_COOKIE } from '../../security/session';
import { authService, registerSchema, loginSchema } from '../auth';
import { cartService, addToCartSchema, removeFromCartSchema } from '../cart';
import { checkoutService, checkoutSchema } from '../checkout';
import { createAddress, addressSchema } from '../addresses/service';
import { paymentService } from '../payments';
import { orderService } from '../orders';
import { adjustStock } from '../inventory/service';
import { saveProduct, getProductBySlug } from './service';
import { productUpsertSchema } from './schema';

const registerRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: registerSchema, handler: ({ body, ctx }) => authService.register(body, ctx) });
const loginRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: loginSchema, handler: ({ body, ctx }) => authService.login(body, ctx) });
const addRoute = defineRoute({ method: 'POST', csrf: false, auth: 'optional', bodySchema: addToCartSchema, handler: ({ body, ctx }) => cartService.addToCart(ctx, body.productId, body.quantity ?? 1, body.variantId) });
const removeRoute = defineRoute({ method: 'DELETE', csrf: false, auth: 'optional', bodySchema: removeFromCartSchema, handler: ({ body, ctx }) => cartService.removeFromCart(ctx, body.productId, body.variantId) });
const cartRoute = defineRoute({ method: 'GET', auth: 'optional', handler: ({ ctx }) => cartService.getPricedCart(ctx) });
const clearRoute = defineRoute({ method: 'DELETE', csrf: false, auth: 'optional', handler: ({ ctx }) => cartService.clearCart(ctx) });
const checkoutRoute = defineRoute({ method: 'POST', csrf: false, auth: 'required', idempotent: { scope: 'checkout' }, bodySchema: checkoutSchema, successStatus: 201, handler: async ({ body, ctx }) => {
  const order = await checkoutService.placeOrder(ctx, body);
  const payment = await paymentService.initPayment(order.id);
  return { order, payment };
} });
const addressRoute = defineRoute({ method: 'POST', csrf: false, auth: 'required', bodySchema: addressSchema, successStatus: 201, handler: ({ body, ctx }) => createAddress(ctx, body) });
const productRoute = defineRoute({ method: 'POST', csrf: false, permission: { resource: 'products', action: 'create' }, bodySchema: productUpsertSchema, successStatus: 201, handler: ({ body, ctx }) => saveProduct(body, ctx) });
const statusRoute = defineRoute({ method: 'PATCH', csrf: false, permission: { resource: 'orders', action: 'edit' }, paramsSchema: z.object({ id: z.string() }), bodySchema: z.object({ status: z.enum(['pending', 'preparing', 'on_the_way', 'delivered', 'cancelled']) }), handler: ({ params, body, ctx }) => orderService.updateOrderStatus(ctx, params.id, body.status) });

const PHONE = '01077665488';
const SKU = 'VAR-EGG';
let userId = '';
let addressId = '';
let productId = '';
let pieceId = '';
let boxId = '';

async function sessionFor(phone: string, password: string): Promise<Record<string, string>> {
  const res = await callRoute(loginRoute, { method: 'POST', body: { identifier: phone, password } });
  return { [SESSION_COOKIE]: res.cookies[SESSION_COOKIE]! };
}
async function stockOf(variantId: string): Promise<{ onHand: number; reserved: number }> {
  const [inv] = await db().select().from(inventoryItems).where(eq(inventoryItems.variantId, variantId)).limit(1);
  return { onHand: inv!.quantityOnHand, reserved: inv!.quantityReserved };
}

describe('product variants (integration)', () => {
  beforeAll(async () => {
    await cleanup();
    const reg = await callRoute(registerRoute, { method: 'POST', body: { name: 'زبون العبوات', phone: PHONE, password: 'Secret@123', defaultVillage: 'عليم' } });
    userId = reg.body.data.id;
    const session = await sessionFor(PHONE, 'Secret@123');
    const addr = await callRoute(addressRoute, { method: 'POST', cookies: session, body: { title: 'المنزل', recipientName: 'زبون', phone: PHONE, village: 'قرية عليم', streetAddress: 'شارع 2', isDefault: true } });
    addressId = addr.body.data.id;
  });
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('the migration left every product with exactly one default variant and every stock row keyed by a variant', async () => {
    const [noDefault] = (await db().execute(sql`SELECT COUNT(*)::int AS n FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_default)`)) as unknown as { n: number }[];
    expect(noDefault!.n).toBe(0);
    const [twoDefaults] = (await db().execute(sql`SELECT COUNT(*)::int AS n FROM (SELECT product_id FROM product_variants WHERE is_default GROUP BY product_id HAVING COUNT(*) > 1) d`)) as unknown as { n: number }[];
    expect(twoDefaults!.n).toBe(0);
    const [orphanStock] = (await db().execute(sql`SELECT COUNT(*)::int AS n FROM inventory_items i WHERE NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.id = i.variant_id)`)) as unknown as { n: number }[];
    expect(orphanStock!.n).toBe(0);
    // The seeded oil still reads exactly as before for a client that knows nothing about variants.
    const oil = await getProductBySlug('crystal-sunflower-oil-1-5l');
    expect(oil.price).toBe(95);
    expect(oil.variants).toHaveLength(1);
    expect(oil.variants![0]!.isDefault).toBe(true);
    expect(oil.defaultVariantId).toBe(oil.variants![0]!.id);
  });

  it('an admin defines piece + tray units with their own price and stock; the storefront exposes both', async () => {
    const admin = await sessionFor('01000000000', 'Admin@12345');
    const res = await callRoute(productRoute, { method: 'POST', cookies: admin, body: {
      sku: SKU, nameAr: 'بيض بلدي', nameEn: 'Eggs', categoryId: 'cat_dairy', unitAr: 'حبة', unitEn: 'piece', price: 5,
      variants: [
        { sku: `${SKU}-1`, nameAr: 'حبة', nameEn: 'Piece', price: 5, stockQuantity: 30, isDefault: true },
        { sku: `${SKU}-12`, nameAr: 'كرتونة 12', nameEn: 'Tray of 12', price: 55, oldPrice: 60, stockQuantity: 2 },
      ],
    } });
    expect(res.status).toBe(201);
    const product = res.body.data;
    productId = product.id;
    expect(product.variants).toHaveLength(2);
    const piece = product.variants.find((v: { nameAr: string }) => v.nameAr === 'حبة');
    const box = product.variants.find((v: { nameAr: string }) => v.nameAr === 'كرتونة 12');
    pieceId = piece.id;
    boxId = box.id;
    expect(product.defaultVariantId).toBe(pieceId);
    expect(piece.stockQuantity).toBe(30);
    expect(box.stockQuantity).toBe(2);
    expect(box.price).toBe(55);
    expect(box.discountPercentage).toBe(8);
    // Product-level numbers mirror the default unit; stock aggregates every unit.
    expect(product.price).toBe(5);
    expect(product.stockQuantity).toBe(32);
  });

  it('cart lines are per variant; checkout snapshots the variant price/name and reserves that variant’s stock', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    await callRoute(clearRoute, { method: 'DELETE', cookies: session });
    expect((await callRoute(addRoute, { method: 'POST', cookies: session, body: { productId, quantity: 2 } })).status).toBe(200); // no variantId → default (piece)
    expect((await callRoute(addRoute, { method: 'POST', cookies: session, body: { productId, variantId: boxId, quantity: 1 } })).status).toBe(200);

    const cart = (await callRoute(cartRoute, { cookies: session })).body.data;
    expect(cart.items).toHaveLength(2);
    const boxLine = cart.items.find((l: { variantId: string }) => l.variantId === boxId);
    expect(boxLine.variant.nameAr).toBe('كرتونة 12');
    expect(boxLine.unitPrice).toBe(55);
    expect(cart.subtotal).toBe(65); // 2×5 + 55

    const placed = await callRoute(checkoutRoute, { method: 'POST', cookies: session, headers: { 'idempotency-key': 'var-order' }, body: { addressId, paymentMethod: 'cod' } });
    expect(placed.status).toBe(201);
    const order = placed.body.data.order;
    const boxItem = order.items.find((i: { variantId?: string }) => i.variantId === boxId);
    const pieceItem = order.items.find((i: { variantId?: string }) => i.variantId === pieceId);
    expect(boxItem.productNameAr).toBe('بيض بلدي — كرتونة 12');
    expect(boxItem.price).toBe(55);
    expect(pieceItem.productNameAr).toBe('بيض بلدي');
    expect(pieceItem.price).toBe(5);
    expect(await stockOf(boxId)).toEqual({ onHand: 2, reserved: 1 });
    expect(await stockOf(pieceId)).toEqual({ onHand: 30, reserved: 2 });

    // Delivery commits the sale per variant.
    const admin = await sessionFor('01000000000', 'Admin@12345');
    for (const s of ['preparing', 'on_the_way', 'delivered']) await callRoute(statusRoute, { method: 'PATCH', cookies: admin, params: { id: order.id }, body: { status: s } });
    expect(await stockOf(boxId)).toEqual({ onHand: 1, reserved: 0 });
    expect(await stockOf(pieceId)).toEqual({ onHand: 28, reserved: 0 });
  });

  it('a stock adjustment targets the named variant; omitting it means the default', async () => {
    const admin = await sessionFor('01000000000', 'Admin@12345');
    const adjustRoute = defineRoute({ method: 'POST', csrf: false, permission: { resource: 'inventory', action: 'edit' }, paramsSchema: z.object({ id: z.string() }), bodySchema: z.object({ quantity: z.number().int(), variantId: z.string().optional() }), handler: ({ params, body, ctx }) => adjustStock(params.id, body.quantity, 'count', ctx, body.variantId) });
    expect((await callRoute(adjustRoute, { method: 'POST', cookies: admin, params: { id: productId }, body: { quantity: 10, variantId: boxId } })).status).toBe(200);
    expect((await callRoute(adjustRoute, { method: 'POST', cookies: admin, params: { id: productId }, body: { quantity: 40 } })).status).toBe(200);
    expect((await stockOf(boxId)).onHand).toBe(10);
    expect((await stockOf(pieceId)).onHand).toBe(40);
  });

  it('a variant dropped from the product is retired, not deleted, and can no longer be added to the cart', async () => {
    const admin = await sessionFor('01000000000', 'Admin@12345');
    const res = await callRoute(productRoute, { method: 'POST', cookies: admin, body: {
      id: productId, sku: SKU, nameAr: 'بيض بلدي', nameEn: 'Eggs', categoryId: 'cat_dairy', unitAr: 'حبة', unitEn: 'piece', price: 5,
      variants: [{ id: pieceId, sku: `${SKU}-1`, nameAr: 'حبة', nameEn: 'Piece', price: 6, isDefault: true }],
    } });
    expect(res.status).toBe(201);
    const product = res.body.data;
    const box = product.variants.find((v: { id: string }) => v.id === boxId);
    expect(box.isActive).toBe(false); // retired — the delivered order above still points at it
    expect(product.price).toBe(6); // the default unit's new price flows to the product row

    const session = await sessionFor(PHONE, 'Secret@123');
    const refused = await callRoute(addRoute, { method: 'POST', cookies: session, body: { productId, variantId: boxId, quantity: 1 } });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('VARIANT_UNAVAILABLE');
    expect((await callRoute(addRoute, { method: 'POST', cookies: session, body: { productId, quantity: 1 } })).status).toBe(200);
    expect((await callRoute(removeRoute, { method: 'DELETE', cookies: session, body: { productId } })).status).toBe(200);
  });
});

async function cleanup() {
  const rows = await db().select({ id: users.id }).from(users).where(inArray(users.phone, [PHONE]));
  const ids = rows.map((r) => r.id);
  await withTriggersDisabled(async (tx) => {
    if (ids.length) {
      await tx.delete(notifications).where(inArray(notifications.userId, ids));
      await tx.delete(emailEvents).where(inArray(emailEvents.userId, ids));
      const os = await tx.select({ id: orders.id }).from(orders).where(inArray(orders.userId, ids));
      const oids = os.map((o: { id: string }) => o.id);
      if (oids.length) {
        await tx.delete(paymentTransactions).where(inArray(paymentTransactions.orderId, oids));
        await tx.delete(paymentIntents).where(inArray(paymentIntents.orderId, oids));
        await tx.delete(payments).where(inArray(payments.orderId, oids));
        await tx.delete(stockReservations).where(inArray(stockReservations.orderId, oids));
        await tx.delete(orderStatusHistory).where(inArray(orderStatusHistory.orderId, oids));
        await tx.delete(orderItems).where(inArray(orderItems.orderId, oids));
        await tx.delete(orders).where(inArray(orders.id, oids));
      }
      const cs = await tx.select({ id: carts.id }).from(carts).where(inArray(carts.userId, ids));
      const cids = cs.map((c: { id: string }) => c.id);
      if (cids.length) await tx.delete(cartItems).where(inArray(cartItems.cartId, cids));
      await tx.delete(carts).where(inArray(carts.userId, ids));
      await tx.delete(addresses).where(inArray(addresses.userId, ids));
      await tx.delete(users).where(inArray(users.id, ids));
    }
    const ps = await tx.select({ id: products.id }).from(products).where(like(products.sku, `${SKU}%`));
    const pids = ps.map((p: { id: string }) => p.id);
    if (pids.length) {
      await tx.delete(stockReservations).where(inArray(stockReservations.productId, pids));
      await tx.delete(stockMovements).where(inArray(stockMovements.productId, pids));
      await tx.delete(inventoryAdjustments).where(inArray(inventoryAdjustments.productId, pids));
      await tx.delete(inventoryItems).where(inArray(inventoryItems.productId, pids));
      await tx.delete(productVariants).where(inArray(productVariants.productId, pids));
      await tx.delete(products).where(inArray(products.id, pids));
    }
  });
}
