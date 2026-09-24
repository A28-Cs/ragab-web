import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { authService } from '@ragab/server/modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = defineRoute({
  method: 'DELETE',
  auth: 'required',
  paramsSchema: z.object({ id: z.string().min(1).max(64) }),
  handler: async ({ params, ctx }) => {
    await authService.revokeOtherSession(params.id, ctx);
    return { ok: true };
  },
});
