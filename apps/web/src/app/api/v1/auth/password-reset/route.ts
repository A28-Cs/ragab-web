import { defineRoute, RATE_RULES } from '@ragab/server';
import { authService, requestPasswordResetSchema } from '@ragab/server/modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  auth: 'none',
  csrf: false,
  rateLimit: RATE_RULES.passwordReset,
  bodySchema: requestPasswordResetSchema,
  handler: async ({ body, ctx }) => {
    await authService.requestPasswordReset(body.phone, ctx);
    // Always identical response (anti-enumeration).
    return { ok: true };
  },
});
