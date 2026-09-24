import { defineRoute } from '@ragab/server';
import { notificationService } from '@ragab/server/modules/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({ method: 'GET', auth: 'required', handler: ({ ctx }) => notificationService.listNotifications(ctx) });
