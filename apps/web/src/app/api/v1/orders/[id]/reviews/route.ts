import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { getOrderReviews } from '@ragab/server/modules/reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  method: 'GET',
  auth: 'required',
  paramsSchema: z.object({ id: z.string().min(1).max(64) }),
  handler: ({ params, ctx }) => getOrderReviews(ctx, params.id),
});
