import { defineRoute } from '@ragab/server';
import { promotionService, promotionUpsertSchema } from '@ragab/server/modules/promotions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Every promotion rule (automatic + codes), banners included. */
export const GET = defineRoute({
  method: 'GET',
  permission: { resource: 'promotions', action: 'view' },
  handler: () => promotionService.listPromotionsAdmin(),
});

export const POST = defineRoute({
  method: 'POST',
  permission: { resource: 'promotions', action: 'create' },
  bodySchema: promotionUpsertSchema,
  successStatus: 201,
  handler: ({ body, ctx }) => promotionService.savePromotion(ctx, { ...body, id: undefined }),
});
