import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { orderService } from '@ragab/server/modules/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Full order detail for the admin screen: items, courier, customer house photo. */
export const GET = defineRoute({
  method: 'GET',
  permission: { resource: 'orders', action: 'view' },
  paramsSchema: z.object({ id: z.string().min(1).max(64) }),
  handler: ({ params, ctx }) => orderService.getOrderDetailForStaff(ctx, params.id),
});
