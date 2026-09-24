import { defineRoute } from '@ragab/server';
import { listIntegrations } from '@ragab/server/modules/integrations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({ method: 'GET', permission: { resource: 'integrations', action: 'view' }, handler: () => listIntegrations() });
