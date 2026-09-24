import { defineRoute, RATE_RULES } from '@ragab/server';
import { wishlistService, wishlistProductParamSchema } from '@ragab/server/modules/wishlist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = defineRoute({
  method: 'DELETE',
  auth: 'required',
  rateLimit: RATE_RULES.writeApi,
  paramsSchema: wishlistProductParamSchema,
  handler: ({ params, ctx }) => wishlistService.removeFromWishlist(ctx, params.productId),
});
