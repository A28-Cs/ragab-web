import { defineRoute, RATE_RULES } from '@ragab/server';
import { authService, twoFactorVerifyLoginSchema } from '@ragab/server/modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  auth: 'none',
  csrf: false,
  rateLimit: RATE_RULES.otp,
  bodySchema: twoFactorVerifyLoginSchema,
  handler: async ({ body, ctx }) => {
    const user = await authService.completeTwoFactorLogin(body.challenge, body.code, ctx);
    // Native clients receive { user, session }; browsers receive the bare User + cookie.
    const session = authService.nativeSession(ctx);
    return session ? { user, session } : user;
  },
});
