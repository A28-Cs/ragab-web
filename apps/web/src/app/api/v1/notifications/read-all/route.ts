import { defineRoute } from '@ragab/server';
import { notificationService } from '@ragab/server/modules/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({ method: 'POST', auth: 'required', handler: async ({ ctx }) => { await notificationService.markAllRead(ctx); return { ok: true }; } });
