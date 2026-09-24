import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { reportService } from '@ragab/server/modules/reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Optional ISO date range; omitted → all-time. The single source of every dashboard number. */
const rangeSchema = z
  .object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() })
  .strict()
  .refine((r) => !r.from || !r.to || r.from <= r.to, { message: 'from must not be after to' });

export const GET = defineRoute({
  method: 'GET',
  permission: { resource: 'reports', action: 'view' },
  querySchema: rangeSchema,
  handler: ({ query }) => reportService.salesReport({ from: query.from, to: query.to }),
});
