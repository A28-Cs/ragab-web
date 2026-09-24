import { defineRoute, RATE_RULES } from '@ragab/server';
import { z } from 'zod';
import { cartService } from '@ragab/server/modules/cart';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Validates a code against the caller's CURRENT cart and returns the discount it would
 * take — computed by the same engine as checkout, after the automatic promotions already
 * in force — so the cart page previews a real number. The checkout quote stays
 * authoritative once an address is chosen. (`subtotal` is accepted for older clients and ignored.)
 */
export const POST = defineRoute({
  method: 'POST',
  auth: 'optional',
  rateLimit: RATE_RULES.coupon,
  bodySchema: z.object({ code: z.string().trim().min(1).max(40), subtotal: z.number().min(0).max(1_000_000).optional() }).strict(),
  handler: ({ body, ctx }) => cartService.previewCoupon(ctx, body.code),
});
