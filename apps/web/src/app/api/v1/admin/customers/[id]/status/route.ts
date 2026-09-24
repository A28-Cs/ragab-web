import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { customerService } from '@ragab/server/modules/customers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({ method: 'POST', permission: { resource: 'customers', action: 'edit' }, paramsSchema: z.object({ id: z.string().min(1).max(64) }), bodySchema: z.object({ blocked: z.boolean() }).strict(), handler: ({ params, body, ctx }) => customerService.setCustomerStatus(ctx, params.id, body.blocked) });
