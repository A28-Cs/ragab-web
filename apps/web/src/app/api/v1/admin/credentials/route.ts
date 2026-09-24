import { defineRoute } from '@ragab/server';
import { credentialsService } from '@ragab/server/modules/credentials';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Masked status only — full secret values are never returned.
export const GET = defineRoute({
  method: 'GET',
  permission: { resource: 'integrations', action: 'view' },
  handler: () => credentialsService.listProviderStatus(),
});
