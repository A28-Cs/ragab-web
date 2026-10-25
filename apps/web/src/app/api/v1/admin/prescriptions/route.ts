import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { listPrescriptions } from '@ragab/server/modules/prescriptions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  method: 'GET',
  permission: { resource: 'orders', action: 'view' },
  querySchema: z.object({
    status: z.enum(['all', 'pending', 'reviewed', 'completed', 'rejected']).optional(),
  }),
  handler: ({ query }) => listPrescriptions(query.status),
});
