import { defineRoute, RATE_RULES } from '@ragab/server';
import { catalogService } from '@ragab/server/modules/catalog';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  method: 'GET',
  auth: 'none',
  rateLimit: RATE_RULES.readApi,
  querySchema: z.object({ limit: z.coerce.number().int().min(1).max(48).default(8) }),
  handler: ({ query }) => catalogService.getPopularProducts(query.limit),
});
