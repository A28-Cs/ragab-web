/**
 * Wishlist input schemas (§23). All `.strict()` (mass-assignment defense, §15).
 */
import { z } from 'zod';

export const wishlistAddSchema = z.object({ productId: z.string().min(1).max(64) }).strict();

/** Bulk merge — used once on first login to push a client's local favourites up. */
export const wishlistMergeSchema = z
  .object({ productIds: z.array(z.string().min(1).max(64)).max(500) })
  .strict();

export const wishlistProductParamSchema = z.object({ productId: z.string().min(1).max(64) }).strict();

export type WishlistAddInput = z.infer<typeof wishlistAddSchema>;
export type WishlistMergeInput = z.infer<typeof wishlistMergeSchema>;
