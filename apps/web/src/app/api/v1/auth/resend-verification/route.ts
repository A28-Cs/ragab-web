import { defineRoute, RATE_RULES } from '@ragab/server';
import { authService, resendVerificationSchema } from '@ragab/server/modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  auth: 'none',
  csrf: false,
  rateLimit: RATE_RULES.login, // using login rate limit to prevent spam
  bodySchema: resendVerificationSchema,
  successStatus: 200,
  handler: async ({ body, ctx }) => {
    await authService.resendEmailVerification(body.email, ctx);
    return { sent: true };
  },
});
