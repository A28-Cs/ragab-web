import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { catalogService, categoryUpsertSchema } from '@ragab/server/modules/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(64) });

/** Partial update — only the fields sent change (see catalogService.saveCategory). */
export const PATCH = defineRoute({
  method: 'PATCH',
  permission: { resource: 'categories', action: 'edit' },
  paramsSchema: params,
  bodySchema: categoryUpsertSchema.omit({ id: true }),
  handler: ({ params, body, ctx }) => catalogService.saveCategory({ ...body, id: params.id }, ctx),
});

/** Soft delete; refused (422 CATEGORY_HAS_PRODUCTS) while products still belong to it. */
export const DELETE = defineRoute({
  method: 'DELETE',
  permission: { resource: 'categories', action: 'delete' },
  paramsSchema: params,
  handler: async ({ params, ctx }) => {
    await catalogService.deleteCategory(params.id, ctx);
    return { deleted: true };
  },
});
