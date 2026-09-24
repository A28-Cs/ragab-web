import { defineRoute } from '@ragab/server';
import { authService } from '@ragab/server/modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  auth: 'optional',
  handler: async ({ ctx }) => {
    await authService.logout(ctx);
    return { ok: true };
  },
});
