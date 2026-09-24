import { defineRoute, RATE_RULES } from '@ragab/server';
import { wishlistService, wishlistMergeSchema } from '@ragab/server/modules/wishlist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Push a client's local favourites up once, on first login (§23).
export const POST = defineRoute({
  method: 'POST',
  auth: 'required',
  rateLimit: RATE_RULES.writeApi,
  bodySchema: wishlistMergeSchema,
  handler: ({ body, ctx }) => wishlistService.mergeWishlist(ctx, body.productIds),
});
