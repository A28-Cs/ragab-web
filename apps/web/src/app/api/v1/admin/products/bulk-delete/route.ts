import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { catalogService } from '@ragab/server/modules/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

export const POST = defineRoute({
  method: 'POST',
  permission: { resource: 'products', action: 'delete' },
  bodySchema: bulkDeleteSchema,
  handler: async ({ body, ctx }) => {
    return catalogService.deleteProducts(body.ids, ctx);
  },
});
