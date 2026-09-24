import { defineRoute, RATE_RULES } from '@ragab/server';
import { catalogService, categoryUpsertSchema } from '@ragab/server/modules/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  method: 'GET',
  auth: 'none',
  rateLimit: RATE_RULES.readApi,
  handler: () => {
    console.log("--> CATEGORIES HANDLER HIT!");
    return catalogService.listCategories();
  },
});

export const POST = defineRoute({
  method: 'POST',
  permission: { resource: 'categories', action: 'create' },
  bodySchema: categoryUpsertSchema,
  successStatus: 201,
  handler: ({ body, ctx }) => catalogService.saveCategory(body, ctx),
});
