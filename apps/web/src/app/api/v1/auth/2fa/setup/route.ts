import { defineRoute } from '@ragab/server';
import { twoFactorService } from '@ragab/server/modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({ method: 'POST', auth: 'required', handler: ({ ctx }) => twoFactorService.setupTwoFactor(ctx) });
