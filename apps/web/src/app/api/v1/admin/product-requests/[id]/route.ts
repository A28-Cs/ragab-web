import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { inventoryService } from '@ragab/server/modules/inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = defineRoute({
  method: 'PATCH',
  permission: { resource: 'inventory', action: 'edit' },
  paramsSchema: z.object({ id: z.string().min(1) }),
  bodySchema: z.object({
    status: z.enum(['pending', 'fulfilled', 'cancelled']),
  }),
  handler: ({ params, body, ctx }) => inventoryService.updateProductRequestStatus(params.id, body.status, ctx),
});
