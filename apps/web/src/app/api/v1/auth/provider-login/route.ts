import { defineRoute, RATE_RULES } from '@ragab/server';
import { authService, providerLoginSchema } from '@ragab/server/modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  auth: 'none',
  csrf: false,
  rateLimit: RATE_RULES.login,
  bodySchema: providerLoginSchema,
  successStatus: 200,
  handler: async ({ body, ctx }) => {
    const user = await authService.providerLogin(body.idToken, body.provider, ctx);
    const session = authService.nativeSession(ctx);
    return session ? { user, session } : user;
  },
});
