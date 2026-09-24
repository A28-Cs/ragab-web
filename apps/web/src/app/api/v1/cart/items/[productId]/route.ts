import { defineRoute, RATE_RULES } from '@ragab/server';
import { z } from 'zod';
import { cartService } from '@ragab/server/modules/cart';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `?variantId=` optional ⇒ the product's default variant line. */
export const DELETE = defineRoute({
  method: 'DELETE',
  auth: 'optional',
  rateLimit: RATE_RULES.cartMutation,
  paramsSchema: z.object({ productId: z.string().min(1).max(64) }),
  querySchema: z.object({ variantId: z.string().min(1).max(64).optional() }),
  handler: ({ params, query, ctx }) => cartService.removeFromCart(ctx, params.productId, query.variantId),
});
