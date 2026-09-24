import { defineRoute } from '@ragab/server';
import { twoFactorService, twoFactorDisableSchema } from '@ragab/server/modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({ method: 'POST', auth: 'required', bodySchema: twoFactorDisableSchema, handler: async ({ body, ctx }) => { await twoFactorService.disableTwoFactor(ctx, body.password); return { ok: true }; } });
