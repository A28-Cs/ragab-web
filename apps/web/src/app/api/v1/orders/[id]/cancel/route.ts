import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { orderService } from '@ragab/server/modules/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  auth: 'required',
  paramsSchema: z.object({ id: z.string().min(1).max(64) }),
  handler: ({ params, ctx }) => orderService.cancelMyOrder(ctx, params.id),
});
