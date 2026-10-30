import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { getProductReviews } from '@ragab/server/modules/reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  method: 'GET',
  auth: 'none',
  paramsSchema: z.object({ slug: z.string().min(1).max(160) }),
  handler: ({ params }) => getProductReviews(params.slug),
});
