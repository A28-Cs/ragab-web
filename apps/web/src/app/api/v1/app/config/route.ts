import { defineRoute, RATE_RULES } from '@ragab/server';
import { appConfigService } from '@ragab/server/modules/appconfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public launch snapshot: version gate + store state + feature flags (§47, §48).
export const GET = defineRoute({
  method: 'GET',
  auth: 'none',
  rateLimit: RATE_RULES.readApi,
  handler: () => appConfigService.getAppConfig(),
});
