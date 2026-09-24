import { defineRoute, RATE_RULES } from '@ragab/server';
import { authService, resetPasswordSchema } from '@ragab/server/modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  auth: 'none',
  csrf: false,
  rateLimit: RATE_RULES.passwordReset,
  bodySchema: resetPasswordSchema,
  handler: async ({ body }) => {
    await authService.resetPassword(body);
    return { ok: true };
  },
});
