import { defineRoute, RATE_RULES } from '@ragab/server';
import { catalogService } from '@ragab/server/modules/catalog';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const byIdsSchema = z.object({
  ids: z.string().transform((s) => s.split(',').filter(Boolean)).pipe(z.array(z.string().max(64)).min(1).max(50)),
}).strict();

/**
 * Batch-fetch products by IDs (for recently-viewed, wishlists, etc).
 * Storefront-visible products only. Accepts comma-separated IDs in query string.
 */
export const GET = defineRoute({
  method: 'GET',
  auth: 'none',
  rateLimit: RATE_RULES.readApi,
  querySchema: byIdsSchema,
  handler: ({ query }) => catalogService.getProductsByIds(query.ids),
});
