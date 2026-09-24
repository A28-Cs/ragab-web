import { defineRoute, RATE_RULES } from '@ragab/server';
import { catalogService, productFiltersSchema } from '@ragab/server/modules/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Facet counts for the filter sidebar (§ search category counts) — how many results
// EACH category has under the current search/price/stock filters, category itself excluded.
export const GET = defineRoute({
  method: 'GET',
  auth: 'none',
  rateLimit: RATE_RULES.readApi,
  querySchema: productFiltersSchema,
  handler: ({ query }) => catalogService.getCategoryFacetCounts(query),
});
