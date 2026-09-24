import { defineRoute } from '@ragab/server';
import { settingsService, settingsUpdateSchema } from '@ragab/server/modules/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({ method: 'GET', permission: { resource: 'settings', action: 'view' }, handler: () => settingsService.getStoreSettings() });
export const PATCH = defineRoute({ method: 'PATCH', permission: { resource: 'settings', action: 'edit' }, bodySchema: settingsUpdateSchema, handler: ({ body, ctx }) => settingsService.updateStoreSettings(ctx, body) });
