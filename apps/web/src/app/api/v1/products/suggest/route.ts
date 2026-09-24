import { defineRoute, RATE_RULES } from '@ragab/server';
import { catalogService, suggestSchema } from '@ragab/server/modules/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Search autocomplete (§15).
export const GET = defineRoute({
  method: 'GET',
  auth: 'none',
  rateLimit: RATE_RULES.search,
  querySchema: suggestSchema,
  handler: ({ query }) => catalogService.suggestProducts(query),
});
