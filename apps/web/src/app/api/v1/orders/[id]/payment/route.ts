import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { orderService } from '@ragab/server/modules/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The customer's next payment step (redirect / transfer instructions / COD) — replayable. */
export const GET = defineRoute({
  method: 'GET',
  auth: 'required',
  paramsSchema: z.object({ id: z.string().min(1).max(64) }),
  handler: ({ params, ctx }) => orderService.getPaymentStep(ctx, params.id),
});
