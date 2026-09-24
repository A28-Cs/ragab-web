import { defineRoute, RATE_RULES } from '@ragab/server';
import { cartService } from '@ragab/server/modules/cart';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  method: 'GET',
  auth: 'optional',
  handler: ({ ctx }) => cartService.getPricedCart(ctx),
});

export const DELETE = defineRoute({
  method: 'DELETE',
  auth: 'optional',
  rateLimit: RATE_RULES.cartMutation,
  handler: ({ ctx }) => cartService.clearCart(ctx),
});
