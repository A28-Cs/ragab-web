import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { orderService, updateDeliverySchema } from '@ragab/server/modules/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Correct an order's delivery snapshot before dispatch (`orders:edit`). */
export const PATCH = defineRoute({
  method: 'PATCH',
  permission: { resource: 'orders', action: 'edit' },
  paramsSchema: z.object({ id: z.string().min(1).max(64) }),
  bodySchema: updateDeliverySchema,
  handler: ({ params, body, ctx }) => orderService.updateOrderDelivery(ctx, params.id, body),
});
