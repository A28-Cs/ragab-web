import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { catalogService, productFiltersSchema } from '@ragab/server/modules/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Control-center product list. Unlike the public GET /products it does NOT apply the
 * storefront visibility filter, so staff can see hidden/inactive products — the ones
 * that were counted on a category card but never shown on its page.
 */
export const GET = defineRoute({
  method: 'GET',
  permission: { resource: 'products', action: 'view' },
  querySchema: productFiltersSchema,
  handler: ({ query }) => catalogService.listProductsAdmin(query),
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

export const DELETE = defineRoute({
  method: 'DELETE',
  permission: { resource: 'products', action: 'delete' },
  bodySchema: bulkDeleteSchema,
  handler: async ({ body, ctx }) => {
    return catalogService.deleteProducts(body.ids, ctx);
  },
});
