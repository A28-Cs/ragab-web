import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { catalogService, productUpsertSchema } from '@ragab/server/modules/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idParam = z.object({ slug: z.string().min(1).max(160) });

export const GET = defineRoute({
  method: 'GET',
  auth: 'none',
  paramsSchema: idParam,
  handler: ({ params }) => catalogService.getProductBySlug(params.slug),
});

export const PATCH = defineRoute({
  method: 'PATCH',
  permission: { resource: 'products', action: 'edit' },
  paramsSchema: idParam,
  bodySchema: productUpsertSchema.partial({ sku: true, nameAr: true, categoryId: true, unitAr: true, unitEn: true, price: true }),
  handler: ({ params, body, ctx }) => catalogService.saveProduct({ ...(body as any), id: params.slug }, ctx),
});

export const DELETE = defineRoute({
  method: 'DELETE',
  permission: { resource: 'products', action: 'delete' },
  paramsSchema: idParam,
  handler: async ({ params, ctx }) => {
    await catalogService.deleteProduct(params.slug, ctx);
    return { ok: true };
  },
});
