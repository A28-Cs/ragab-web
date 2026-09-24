import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { orderService, assignCourierSchema } from '@ragab/server/modules/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Record who is delivering an order — name + phone, no driver-account system (`orders:edit`). */
export const PATCH = defineRoute({
  method: 'PATCH',
  permission: { resource: 'orders', action: 'edit' },
  paramsSchema: z.object({ id: z.string().min(1).max(64) }),
  bodySchema: assignCourierSchema,
  handler: ({ params, body, ctx }) => orderService.assignCourier(ctx, params.id, body),
});
