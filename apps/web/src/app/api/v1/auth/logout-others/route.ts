import { defineRoute } from '@ragab/server';
import { authService } from '@ragab/server/modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({ method: 'POST', auth: 'required', handler: async ({ ctx }) => { await authService.logoutOtherDevices(ctx); return { ok: true }; } });
