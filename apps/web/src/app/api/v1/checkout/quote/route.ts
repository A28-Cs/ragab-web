import { defineRoute, RATE_RULES } from '@ragab/server';
import { checkoutService, quoteSchema } from '@ragab/server/modules/checkout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  auth: 'required',
  rateLimit: RATE_RULES.checkout,
  bodySchema: quoteSchema,
  handler: ({ body, ctx }) => checkoutService.quote(ctx, body),
});
