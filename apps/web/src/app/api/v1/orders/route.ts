import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { orderService } from '@ragab/server/modules/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  method: 'GET',
  auth: 'required',
  querySchema: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), cursor: z.string().max(512).optional() }),
  handler: ({ query, ctx }) => orderService.getMyOrders(ctx, query),
});
