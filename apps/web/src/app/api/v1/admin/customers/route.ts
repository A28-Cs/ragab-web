import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { customerService } from '@ragab/server/modules/customers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({ method: 'GET', permission: { resource: 'customers', action: 'view' }, querySchema: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), cursor: z.string().max(512).optional(), search: z.string().max(120).optional() }), handler: ({ query, ctx }) => customerService.listCustomers(ctx, query) });
