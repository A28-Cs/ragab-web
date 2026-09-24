import { defineRoute, RATE_RULES } from '@ragab/server';
import { cartService, addToCartSchema, updateQuantitySchema } from '@ragab/server/modules/cart';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `variantId` optional ⇒ the product's default variant (piece / box / weight — 0007). */
export const POST = defineRoute({
  method: 'POST',
  auth: 'optional',
  rateLimit: RATE_RULES.cartMutation,
  bodySchema: addToCartSchema,
  handler: ({ body, ctx }) => cartService.addToCart(ctx, body.productId, body.quantity, body.variantId),
});

export const PATCH = defineRoute({
  method: 'PATCH',
  auth: 'optional',
  rateLimit: RATE_RULES.cartMutation,
  bodySchema: updateQuantitySchema,
  handler: ({ body, ctx }) => cartService.updateQuantity(ctx, body.productId, body.quantity, body.variantId),
});
