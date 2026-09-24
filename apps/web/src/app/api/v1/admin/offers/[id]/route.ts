import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { saveOffer, deleteOffer, offerUpsertSchema } from '@ragab/server/modules/offers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const p = z.object({ id: z.string().min(1).max(64) });
export const PUT = defineRoute({ method: 'PUT', permission: { resource: 'promotions', action: 'edit' }, paramsSchema: p, bodySchema: offerUpsertSchema, handler: ({ params, body, ctx }) => saveOffer(ctx, { ...body, id: params.id }) });
export const DELETE = defineRoute({ method: 'DELETE', permission: { resource: 'promotions', action: 'delete' }, paramsSchema: p, handler: async ({ params, ctx }) => { await deleteOffer(ctx, params.id); return { ok: true }; } });
