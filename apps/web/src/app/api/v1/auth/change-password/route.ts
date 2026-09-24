import { defineRoute } from '@ragab/server';
import { authService, changePasswordSchema } from '@ragab/server/modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  auth: 'required',
  bodySchema: changePasswordSchema,
  handler: async ({ body, ctx }) => {
    await authService.changePassword(body, ctx);
    return { ok: true };
  },
});
