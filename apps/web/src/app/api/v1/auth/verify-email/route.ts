import { defineRoute, RATE_RULES } from '@ragab/server';
import { authService, verifyEmailSchema } from '@ragab/server/modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  auth: 'none',
  csrf: false,
  rateLimit: RATE_RULES.login, // using login rate limit for verification attempts
  bodySchema: verifyEmailSchema,
  successStatus: 200,
  handler: async ({ body, ctx }) => {
    await authService.verifyEmail(body.token, ctx);
    return { verified: true };
  },
});
