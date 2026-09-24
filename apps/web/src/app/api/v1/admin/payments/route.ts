import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { listPayments } from '@ragab/server/modules/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  method: 'GET',
  permission: { resource: 'payments', action: 'view' },
  querySchema: z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) }),
  handler: ({ query }) => listPayments(query.limit),
});
