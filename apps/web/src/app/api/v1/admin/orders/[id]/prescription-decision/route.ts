import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { orderService, prescriptionDecisionSchema } from '@ragab/server/modules/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = defineRoute({
  method: 'PATCH',
  permission: { resource: 'orders', action: 'edit' },
  paramsSchema: z.object({ id: z.string().min(1).max(64) }),
  bodySchema: prescriptionDecisionSchema,
  handler: ({ params, body, ctx }) =>
    orderService.updatePrescriptionDecision(ctx, params.id, body.decision, body.reason),
});
