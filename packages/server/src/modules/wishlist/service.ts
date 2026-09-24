/**
 * Wishlist service (§23). Backed by the existing `wishlists` / `wishlist_items` tables
 * (previously unused — the web kept favourites in localStorage). Making this the single
 * source means favourites finally agree across web and mobile. Every mutation returns
 * the full hydrated list so a client cache reconciles to server truth (like the cart).
 * Products that are hidden/soft-deleted are filtered out at hydration.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { RequestContext } from '../../http/context';
import { db } from '../../db/client';
import { wishlists, wishlistItems } from '../../db/schema';
import { AuthenticationError, NotFoundError } from '../../lib/errors';
import { prefixedId } from '../../lib/ids';
import { findProductsByIds } from '../catalog/repository';
import { toProductDto } from '../catalog/mapper';
import type { Product } from '../../types';

function requireUser(ctx: RequestContext): string {
  if (!ctx.principal) throw new AuthenticationError({ message: { ar: 'يجب تسجيل الدخول.', en: 'Authentication required.' } });
  return ctx.principal.userId;
}

/** Resolve (or create) the user's single wishlist row. */
async function resolveWishlist(userId: string, create: boolean): Promise<string | null> {
  const [existing] = await db().select({ id: wishlists.id }).from(wishlists).where(eq(wishlists.userId, userId)).limit(1);
  if (existing) return existing.id;
  if (!create) return null;
  const id = prefixedId('wl');
  // onConflictDoNothing guards the unique(user_id) against a race, then we re-read.
  await db().insert(wishlists).values({ id, userId }).onConflictDoNothing();
  const [row] = await db().select({ id: wishlists.id }).from(wishlists).where(eq(wishlists.userId, userId)).limit(1);
  return row?.id ?? id;
}

/** Hydrate the wishlist to full, currently-visible Product DTOs (newest first). */
async function hydrate(wishlistId: string | null): Promise<Product[]> {
  if (!wishlistId) return [];
  const items = await db()
    .select({ productId: wishlistItems.productId, addedAt: wishlistItems.createdAt })
    .from(wishlistItems)
    .where(eq(wishlistItems.wishlistId, wishlistId))
    .orderBy(desc(wishlistItems.createdAt));
  if (items.length === 0) return [];
  const rows = await findProductsByIds(items.map((i) => i.productId), db(), { visibleOnly: true });
  const byId = new Map(rows.map((r) => [r.id, r]));
  // Preserve wishlist order (most recently added first); drop unavailable products.
  return items.map((i) => byId.get(i.productId)).filter((r): r is NonNullable<typeof r> => Boolean(r)).map(toProductDto);
}

export async function getWishlist(ctx: RequestContext): Promise<Product[]> {
  const wishlistId = await resolveWishlist(requireUser(ctx), false);
  return hydrate(wishlistId);
}

export async function addToWishlist(ctx: RequestContext, productId: string): Promise<Product[]> {
  const userId = requireUser(ctx);
  const [product] = await findProductsByIds([productId], db(), { visibleOnly: true });
  if (!product) throw new NotFoundError({ code: 'PRODUCT_NOT_FOUND', message: { ar: 'المنتج غير موجود.', en: 'Product not found.' } });
  const wishlistId = (await resolveWishlist(userId, true))!;
  await db()
    .insert(wishlistItems)
    .values({ id: prefixedId('wli'), wishlistId, productId })
    .onConflictDoNothing();
  return hydrate(wishlistId);
}

export async function removeFromWishlist(ctx: RequestContext, productId: string): Promise<Product[]> {
  const userId = requireUser(ctx);
  const wishlistId = await resolveWishlist(userId, false);
  if (wishlistId) {
    await db().delete(wishlistItems).where(and(eq(wishlistItems.wishlistId, wishlistId), eq(wishlistItems.productId, productId)));
  }
  return hydrate(wishlistId);
}

/**
 * Merge a client's local favourites into the server wishlist (idempotent). Called once
 * after first login so a user who favourited items while signed out keeps them (§23).
 */
export async function mergeWishlist(ctx: RequestContext, productIds: string[]): Promise<Product[]> {
  const userId = requireUser(ctx);
  const wishlistId = (await resolveWishlist(userId, true))!;
  const unique = [...new Set(productIds)];
  if (unique.length > 0) {
    // Only merge ids that are real, visible products.
    const valid = await findProductsByIds(unique, db(), { visibleOnly: true });
    const existing = await db().select({ productId: wishlistItems.productId }).from(wishlistItems).where(and(eq(wishlistItems.wishlistId, wishlistId), inArray(wishlistItems.productId, valid.map((v) => v.id))));
    const have = new Set(existing.map((e) => e.productId));
    const toAdd = valid.filter((v) => !have.has(v.id));
    if (toAdd.length > 0) {
      await db().insert(wishlistItems).values(toAdd.map((v) => ({ id: prefixedId('wli'), wishlistId, productId: v.id }))).onConflictDoNothing();
    }
  }
  return hydrate(wishlistId);
}
