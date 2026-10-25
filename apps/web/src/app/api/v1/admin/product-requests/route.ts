import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { inventoryService } from '@ragab/server/modules/inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  method: 'GET',
  permission: { resource: 'inventory', action: 'view' },
  querySchema: z.object({
    status: z.enum(['all', 'pending', 'fulfilled', 'cancelled']).optional(),
  }),
  handler: ({ query, ctx }) => inventoryService.listProductRequests(query.status, ctx),
});
