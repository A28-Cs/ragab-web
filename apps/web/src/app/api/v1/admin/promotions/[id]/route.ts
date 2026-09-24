import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { promotionService, promotionUpsertSchema } from '@ragab/server/modules/promotions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(64) });

export const PUT = defineRoute({
  method: 'PUT',
  permission: { resource: 'promotions', action: 'edit' },
  paramsSchema: params,
  bodySchema: promotionUpsertSchema,
  handler: ({ params, body, ctx }) => promotionService.savePromotion(ctx, { ...body, id: params.id }),
});

/** Deletes an unused rule; a rule that has been redeemed is deactivated instead (history). */
export const DELETE = defineRoute({
  method: 'DELETE',
  permission: { resource: 'promotions', action: 'delete' },
  paramsSchema: params,
  handler: ({ params, ctx }) => promotionService.deletePromotion(ctx, params.id),
});
