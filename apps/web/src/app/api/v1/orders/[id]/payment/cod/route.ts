import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { orderService } from '@ragab/server/modules/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Recovery after a failed / abandoned online payment: fall back to cash on delivery. */
export const POST = defineRoute({
  method: 'POST',
  auth: 'required',
  paramsSchema: z.object({ id: z.string().min(1).max(64) }),
  handler: ({ params, ctx }) => orderService.switchPaymentToCod(ctx, params.id),
});
