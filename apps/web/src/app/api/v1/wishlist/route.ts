import { defineRoute, RATE_RULES } from '@ragab/server';
import { wishlistService, wishlistAddSchema } from '@ragab/server/modules/wishlist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  method: 'GET',
  auth: 'required',
  rateLimit: RATE_RULES.readApi,
  handler: ({ ctx }) => wishlistService.getWishlist(ctx),
});

export const POST = defineRoute({
  method: 'POST',
  auth: 'required',
  rateLimit: RATE_RULES.writeApi,
  bodySchema: wishlistAddSchema,
  handler: ({ body, ctx }) => wishlistService.addToWishlist(ctx, body.productId),
});
