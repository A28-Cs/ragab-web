import { defineRoute } from '@ragab/server';
import { notificationService, notificationPreferencesSchema } from '@ragab/server/modules/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({ method: 'GET', auth: 'required', handler: ({ ctx }) => notificationService.getPreferences(ctx) });

export const PATCH = defineRoute({
  method: 'PATCH',
  auth: 'required',
  bodySchema: notificationPreferencesSchema,
  handler: ({ body, ctx }) => notificationService.updatePreferences(ctx, body),
});
