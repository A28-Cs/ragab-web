import { defineRoute } from '@ragab/server';
import { listAllOffers, saveOffer, offerUpsertSchema } from '@ragab/server/modules/offers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({ method: 'GET', permission: { resource: 'promotions', action: 'view' }, handler: () => listAllOffers() });
export const POST = defineRoute({ method: 'POST', permission: { resource: 'promotions', action: 'create' }, bodySchema: offerUpsertSchema, successStatus: 201, handler: ({ body, ctx }) => saveOffer(ctx, { ...body, id: undefined }) });
