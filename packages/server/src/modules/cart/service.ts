/**
 * Cart service (§8) — server-authoritative. cart_items store ONLY productId + quantity;
 * every read reprices from live product data + store settings via the shared pricing
 * engine. The client's CartContext becomes a thin cache of getPricedCart's response.
 * A cart belongs to a user (authenticated) or an anonymous token cookie, merged on login.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { RequestContext } from '../../http/context';
import { db } from '../../db/client';
import { carts, cartItems } from '../../db/schema';
import { DEFAULT_STORE_ID } from '../../db/schema/system';
import { BusinessRuleError, NotFoundError } from '../../lib/errors';
import { prefixedId } from '../../lib/ids';
import { generateToken, hashToken } from '../../security/tokens';
import { Money } from '../../lib/money';
import { findProductsByIds } from '../catalog/repository';
import { toProductDto, type ProductRow, type VariantRow } from '../catalog/mapper';
import { getSettings } from '../settings/service';
import { computeTotals, type PriceLine, type AppliedPromotion } from '../pricing/engine';
import { defaultZoneForUser } from '../shipping/service';
import { loadActivePromotions, validateCoupon } from '../promotions/service';
import type { PricedCart, CartLine, AppliedPromotionDto } from '../../types';

const CART_COOKIE = 'ragab_cart';
const MAX_QTY_PER_LINE = 99;

interface CartRef {
  id: string;
  isAnonymous: boolean;
  /** Owner, when signed in — lets the cart show the fee of their default address's zone. */
  userId?: string;
}

/**
 * The raw anonymous-cart identity this request presents: the `ragab_cart` cookie in
 * a browser, or the stable per-install device id for the native app (which has no
 * cookie jar, so a cookie-only guest cart would be thrown away on every request).
 */
function anonymousIdentity(ctx: RequestContext): { raw: string; source: 'cookie' | 'device' } | null {
  const cookie = ctx.cookie(CART_COOKIE);
  if (cookie) return { raw: cookie, source: 'cookie' };
  if (ctx.isNativeClient && ctx.deviceId) return { raw: `dev:${ctx.deviceId}`, source: 'device' };
  return null;
}

/** Resolve the caller's cart, optionally creating it (and an anon cookie) on demand. */
async function resolveCart(ctx: RequestContext, create: boolean): Promise<CartRef | null> {
  if (ctx.principal) {
    const [existing] = await db().select().from(carts).where(and(eq(carts.userId, ctx.principal.userId), eq(carts.status, 'active'))).limit(1);
    if (existing) return { id: existing.id, isAnonymous: false, userId: ctx.principal.userId };
    if (!create) return null;
    const id = prefixedId('cart');
    // Two first requests racing here both try to create; the partial unique index lets
    // exactly one win and the loser adopts it — one active cart per user, always.
    const inserted = await db().insert(carts).values({ id, userId: ctx.principal.userId, status: 'active' }).onConflictDoNothing().returning({ id: carts.id });
    if (inserted.length === 0) {
      const [winner] = await db().select().from(carts).where(and(eq(carts.userId, ctx.principal.userId), eq(carts.status, 'active'))).limit(1);
      return { id: winner!.id, isAnonymous: false, userId: ctx.principal.userId };
    }
    return { id, isAnonymous: false, userId: ctx.principal.userId };
  }

  // Anonymous: identified by a hashed token (cookie) or the hashed device id (native).
  const identity = anonymousIdentity(ctx);
  if (identity) {
    const [existing] = await db().select().from(carts).where(and(eq(carts.anonymousToken, hashToken(identity.raw)), eq(carts.status, 'active'))).limit(1);
    if (existing) return { id: existing.id, isAnonymous: true };
  }
  if (!create) return null;
  const id = prefixedId('cart');
  if (identity?.source === 'device') {
    // Native guest: the device id IS the identity — nothing to hand back to the client.
    await db().insert(carts).values({ id, anonymousToken: hashToken(identity.raw), status: 'active' });
    return { id, isAnonymous: true };
  }
  const token = generateToken(24);
  await db().insert(carts).values({ id, anonymousToken: hashToken(token), status: 'active' });
  ctx.setCookie(CART_COOKIE, token, { httpOnly: true, sameSite: 'Lax', maxAge: 60 * 60 * 24 * 30 });
  return { id, isAnonymous: true };
}

/** Compute the fully-priced cart from live data. Out-of-stock lines are clamped/flagged. */
export async function getPricedCart(ctx: RequestContext): Promise<PricedCart> {
  const ref = await resolveCart(ctx, false);
  return priceCartRef(ref);
}

/**
 * Price a specific cart ref. Mutations call this with the ref they JUST resolved, so
 * the freshly-created anon cart (whose cookie is only on the OUTGOING response, not the
 * incoming request) is priced correctly within the same request.
 */
async function priceCartRef(ref: CartRef | null): Promise<PricedCart> {
  const settings = await getSettings();
  if (!ref) return emptyCart(settings.freeDeliveryThresholdMinor);

  const { lines, priceLines } = await buildLines(ref.id);
  if (lines.length === 0) return emptyCart(settings.freeDeliveryThresholdMinor);

  // A signed-in customer sees the fee of their default address's zone — the same number
  // checkout will charge (AC-14). Guests (no address yet) see the store default.
  const zone = ref.userId ? await defaultZoneForUser(ref.userId) : null;
  // Automatic promotions apply here exactly as they will at checkout (0008).
  const promotions = await loadActivePromotions({ userId: ref.userId });
  const totals = computeTotals({
    lines: priceLines,
    deliveryFeeMinor: zone ? zone.deliveryFeeMinor : settings.deliveryFeeMinor,
    freeDeliveryThresholdMinor: settings.freeDeliveryThresholdMinor,
    promotions,
    tax: settings.tax,
  });

  const subtotalMajor = Money.ofMinor(totals.subtotalMinor).toMajor();
  const thresholdMajor = Money.ofMinor(settings.freeDeliveryThresholdMinor).toMajor();

  return {
    items: lines,
    deliveryZone: zone ? { id: zone.id, nameAr: zone.nameAr, nameEn: zone.nameEn, estimatedTimeAr: zone.estimatedTimeAr, estimatedTimeEn: zone.estimatedTimeEn } : null,
    appliedPromotions: totals.applied.map(appliedDto),
    totalItems: lines.reduce((n, l) => n + l.quantity, 0),
    subtotal: subtotalMajor,
    deliveryFee: Money.ofMinor(totals.deliveryFeeMinor).toMajor(),
    discount: Money.ofMinor(totals.discountMinor).toMajor(),
    tax: Money.ofMinor(totals.taxMinor).toMajor(),
    total: Money.ofMinor(totals.totalMinor).toMajor(),
    freeDeliveryThreshold: thresholdMajor,
    freeDeliveryProgress: thresholdMajor > 0 ? Math.min(100, Math.round((subtotalMajor / thresholdMajor) * 100)) : 100,
    currency: 'EGP',
  };
}

/** Sellable, in-stock lines of a cart with their engine inputs (variant price + category for scoped rules). */
async function buildLines(cartId: string): Promise<{ lines: CartLine[]; priceLines: PriceLine[] }> {
  const items = await db().select().from(cartItems).where(eq(cartItems.cartId, cartId));
  if (items.length === 0) return { lines: [], priceLines: [] };
  const productRows = await findProductsByIds(items.map((i) => i.productId));
  const byId = new Map(productRows.map((p) => [p.id, p]));

  const lines: CartLine[] = [];
  const priceLines: PriceLine[] = [];
  for (const item of items) {
    const row = byId.get(item.productId);
    if (!row) continue; // product removed — silently drop from the priced view
    const variant = row.variants?.find((v) => v.id === item.variantId && v.isActive);
    if (!variant) continue; // variant retired — nothing sellable to show
    const product = toProductDto(row);
    // Clamp the effective quantity to what is actually available for THAT variant (server truth).
    const qty = Math.min(item.quantity, Math.max(0, variant.available));
    if (qty <= 0) continue;
    const unitPrice = Money.ofMinor(variant.priceMinor).toMajor();
    lines.push({
      product,
      quantity: qty,
      variantId: variant.id,
      variant: { id: variant.id, nameAr: variant.nameAr, nameEn: variant.nameEn ?? undefined, unitAr: variant.unitAr ?? undefined, unitEn: variant.unitEn ?? undefined, price: unitPrice, isDefault: variant.isDefault },
      unitPrice,
    });
    priceLines.push({ productId: product.id, variantId: variant.id, quantity: qty, unitPriceMinor: variant.priceMinor, categoryId: row.categoryId });
  }
  return { lines, priceLines };
}

function appliedDto(a: AppliedPromotion): AppliedPromotionDto {
  return { id: a.id, code: a.code ?? null, type: a.type, titleAr: a.titleAr, titleEn: a.titleEn, discount: Money.ofMinor(a.discountMinor).toMajor(), freeDelivery: a.freeDelivery, giftProductId: a.giftProductId ?? null };
}

/**
 * What an entered code would do to THIS cart, computed by the same engine as checkout —
 * after the automatic promotions already in force, so the preview never over-promises.
 */
export async function previewCoupon(ctx: RequestContext, code: string): Promise<{ code: string; type: string; valid: true; discount: number; freeDelivery: boolean; giftProductId?: string }> {
  const ref = await resolveCart(ctx, false);
  const { priceLines } = ref ? await buildLines(ref.id) : { priceLines: [] as PriceLine[] };
  const subtotalMinor = priceLines.reduce((s, l) => s + l.unitPriceMinor * l.quantity, 0);
  const userId = ctx.principal?.userId ?? null;
  const coupon = await validateCoupon(code, userId, subtotalMinor);
  const settings = await getSettings();
  const automatic = await loadActivePromotions({ userId });
  const totals = computeTotals({
    lines: priceLines,
    deliveryFeeMinor: settings.deliveryFeeMinor,
    freeDeliveryThresholdMinor: settings.freeDeliveryThresholdMinor,
    promotions: [...automatic, coupon],
    tax: settings.tax,
  });
  const mine = totals.applied.find((a) => a.id === coupon.id);
  return {
    code: coupon.code,
    type: coupon.type,
    valid: true,
    discount: Money.ofMinor(mine?.discountMinor ?? 0).toMajor(),
    freeDelivery: Boolean(mine?.freeDelivery),
    giftProductId: mine?.giftProductId ?? undefined,
  };
}

/** The sellable variant a request means: the given id (must be this product's and active), else the default. */
function resolveVariant(row: ProductRow, variantId?: string): VariantRow {
  const list = row.variants ?? [];
  const v = variantId ? list.find((x) => x.id === variantId) : (list.find((x) => x.isDefault) ?? list[0]);
  if (!v || !v.isActive) {
    throw new BusinessRuleError({
      code: 'VARIANT_UNAVAILABLE',
      message: { ar: 'هذه العبوة غير متاحة حالياً.', en: 'This packaging option is not available.' },
      meta: { productId: row.id, ...(variantId ? { variantId } : {}) },
    });
  }
  return v;
}

/** A cart line is (cart, product, variant); no variant given ⇒ the product's default variant. */
function lineWhere(cartId: string, productId: string, variantId?: string) {
  return and(
    eq(cartItems.cartId, cartId),
    eq(cartItems.productId, productId),
    variantId
      ? eq(cartItems.variantId, variantId)
      : sql`${cartItems.variantId} = (SELECT id FROM product_variants WHERE product_id = ${productId} AND is_default LIMIT 1)`,
  );
}

export async function addToCart(ctx: RequestContext, productId: string, quantity: number, variantId?: string): Promise<PricedCart> {
  if (quantity < 1 || quantity > MAX_QTY_PER_LINE) {
    throw new BusinessRuleError({ code: 'INVALID_QUANTITY', message: { ar: 'الكمية غير صحيحة.', en: 'Invalid quantity.' } });
  }
  const [product] = await findProductsByIds([productId]);
  if (!product) throw new NotFoundError({ code: 'PRODUCT_NOT_FOUND', message: { ar: 'المنتج غير موجود.', en: 'Product not found.' } });
  const variant = resolveVariant(product, variantId);

  const ref = await resolveCart(ctx, true);
  // One statement: two taps racing on the same line add up instead of colliding on the
  // (cart, product, variant) unique index or silently forking the line.
  await db()
    .insert(cartItems)
    .values({ id: prefixedId('ci'), cartId: ref!.id, productId, variantId: variant.id, quantity: Math.min(quantity, MAX_QTY_PER_LINE) })
    .onConflictDoUpdate({
      target: [cartItems.cartId, cartItems.productId, cartItems.variantId],
      set: { quantity: sql`LEAST(${cartItems.quantity} + ${quantity}, ${MAX_QTY_PER_LINE})` },
    });
  return priceCartRef(ref);
}

export async function updateQuantity(ctx: RequestContext, productId: string, quantity: number, variantId?: string): Promise<PricedCart> {
  const ref = await resolveCart(ctx, false);
  if (!ref) return priceCartRef(null);
  if (quantity <= 0) {
    await db().delete(cartItems).where(lineWhere(ref.id, productId, variantId));
  } else {
    await db()
      .update(cartItems)
      .set({ quantity: Math.min(quantity, MAX_QTY_PER_LINE) })
      .where(lineWhere(ref.id, productId, variantId));
  }
  return priceCartRef(ref);
}

export async function removeFromCart(ctx: RequestContext, productId: string, variantId?: string): Promise<PricedCart> {
  const ref = await resolveCart(ctx, false);
  if (ref) await db().delete(cartItems).where(lineWhere(ref.id, productId, variantId));
  return priceCartRef(ref);
}

export async function clearCart(ctx: RequestContext): Promise<PricedCart> {
  const ref = await resolveCart(ctx, false);
  if (ref) await db().delete(cartItems).where(eq(cartItems.cartId, ref.id));
  return priceCartRef(ref);
}

/**
 * Merge an anonymous cart into the user's cart on login (§8). Called by the auth flow
 * after a session is established. Quantities are summed and capped.
 */
export async function mergeAnonymousCart(ctx: RequestContext, userId: string): Promise<void> {
  const identity = anonymousIdentity(ctx);
  if (!identity) return;
  const [anon] = await db().select().from(carts).where(and(eq(carts.anonymousToken, hashToken(identity.raw)), eq(carts.status, 'active'))).limit(1);
  if (!anon) return;

  const [userCart] = await db().select().from(carts).where(and(eq(carts.userId, userId), eq(carts.status, 'active'))).limit(1);
  const targetId = userCart?.id ?? prefixedId('cart');
  await db().transaction(async (tx) => {
    if (!userCart) await tx.insert(carts).values({ id: targetId, userId, status: 'active' });
    const anonItems = await tx.select().from(cartItems).where(eq(cartItems.cartId, anon.id));
    for (const item of anonItems) {
      const [existing] = await tx.select().from(cartItems).where(lineWhere(targetId, item.productId, item.variantId)).limit(1);
      if (existing) {
        await tx.update(cartItems).set({ quantity: Math.min(existing.quantity + item.quantity, MAX_QTY_PER_LINE) }).where(eq(cartItems.id, existing.id));
      } else {
        await tx.insert(cartItems).values({ id: prefixedId('ci'), cartId: targetId, productId: item.productId, variantId: item.variantId, quantity: item.quantity });
      }
    }
    await tx.update(carts).set({ status: 'abandoned' }).where(eq(carts.id, anon.id));
  });
  if (identity.source === 'cookie') ctx.clearCookie(CART_COOKIE);
}

function emptyCart(thresholdMinor: number): PricedCart {
  return {
    items: [],
    deliveryZone: null,
    appliedPromotions: [],
    totalItems: 0,
    subtotal: 0,
    deliveryFee: 0,
    discount: 0,
    tax: 0,
    total: 0,
    freeDeliveryThreshold: Money.ofMinor(thresholdMinor).toMajor(),
    freeDeliveryProgress: 0,
    currency: 'EGP',
  };
}

/** Internal: the active cart's line items (product + variant + qty), used by checkout. */
export async function getCartLines(ctx: RequestContext): Promise<{ cartId: string; lines: { productId: string; variantId: string; quantity: number }[] } | null> {
  const ref = await resolveCart(ctx, false);
  if (!ref) return null;
  const items = await db().select({ productId: cartItems.productId, variantId: cartItems.variantId, quantity: cartItems.quantity }).from(cartItems).where(eq(cartItems.cartId, ref.id));
  return { cartId: ref.id, lines: items };
}

export { CART_COOKIE };
