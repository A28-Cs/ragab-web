import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { confirmManualPayment } from '@ragab/server/modules/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  permission: { resource: 'payments', action: 'approve' },
  paramsSchema: z.object({ orderId: z.string().min(1).max(64) }),
  handler: ({ params, ctx }) => confirmManualPayment(ctx, params.orderId),
});
