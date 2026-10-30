import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { submitCourierRating, getCourierRating } from '@ragab/server/modules/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.string().min(1).max(64) });

export const GET = defineRoute({
  method: 'GET',
  auth: 'none',
  paramsSchema,
  handler: ({ params }) => getCourierRating(params.id),
});

export const POST = defineRoute({
  method: 'POST',
  auth: 'required',
  paramsSchema,
  bodySchema: z.object({
    rating: z.coerce.number().int().min(1).max(5),
    comment: z.string().max(1000).optional(),
  }),
  handler: ({ params, body, ctx }) =>
    submitCourierRating(ctx, {
      orderId: params.id,
      rating: body.rating,
      comment: body.comment,
    }),
});
