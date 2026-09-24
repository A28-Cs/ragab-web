import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { notificationService } from '@ragab/server/modules/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({ method: 'POST', auth: 'required', paramsSchema: z.object({ id: z.string().min(1).max(64) }), handler: async ({ params, ctx }) => { await notificationService.markRead(ctx, params.id); return { ok: true }; } });
