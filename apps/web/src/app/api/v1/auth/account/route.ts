import { defineRoute, RATE_RULES } from '@ragab/server';
import { authService, deleteAccountSchema } from '@ragab/server/modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = defineRoute({
  method: 'DELETE',
  auth: 'required',
  rateLimit: RATE_RULES.deleteAccount,
  bodySchema: deleteAccountSchema,
  handler: async ({ body, ctx }) => {
    await authService.deleteAccount(body, ctx);
    return { ok: true };
  },
});
