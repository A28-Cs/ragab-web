import { defineRoute } from '@ragab/server';
import { twoFactorService, twoFactorEnableSchema } from '@ragab/server/modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({ method: 'POST', auth: 'required', bodySchema: twoFactorEnableSchema, handler: ({ body, ctx }) => twoFactorService.enableTwoFactor(ctx, body.code) });
