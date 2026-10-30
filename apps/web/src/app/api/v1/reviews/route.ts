import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { submitReview } from '@ragab/server/modules/reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const submitReviewSchema = z.object({
  productId: z.string().min(1).max(64),
  orderId: z.string().max(64).optional(),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().max(128).optional(),
  comment: z.string().max(1000).optional(),
});

export const POST = defineRoute({
  method: 'POST',
  auth: 'required',
  bodySchema: submitReviewSchema,
  handler: ({ body, ctx }) => submitReview(ctx, body),
});
