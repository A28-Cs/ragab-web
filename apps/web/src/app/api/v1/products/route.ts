import { defineRoute, RATE_RULES } from '@ragab/server';
import { catalogService, productFiltersSchema, productUpsertSchema } from '@ragab/server/modules/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  method: 'GET',
  auth: 'none',
  rateLimit: RATE_RULES.readApi,
  querySchema: productFiltersSchema,
  handler: ({ query }) => catalogService.getProducts(query),
});

export const POST = defineRoute({
  method: 'POST',
  permission: { resource: 'products', action: 'create' },
  bodySchema: productUpsertSchema,
  successStatus: 201,
  handler: ({ body, ctx }) => catalogService.saveProduct({ ...body, id: undefined }, ctx),
});
