import { z } from 'zod';

/** `variantId` omitted ⇒ the product's default variant (clients that predate variants keep working). */
const variantId = z.string().min(1).max(64).optional();

export const addToCartSchema = z.object({
  productId: z.string().min(1).max(64),
  variantId,
  quantity: z.number().int().min(1).max(99).default(1),
}).strict();

export const updateQuantitySchema = z.object({
  productId: z.string().min(1).max(64),
  variantId,
  quantity: z.number().int().min(0).max(99),
}).strict();

export const removeFromCartSchema = z.object({ productId: z.string().min(1).max(64), variantId }).strict();
