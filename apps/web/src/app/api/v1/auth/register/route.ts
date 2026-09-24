import { defineRoute, RATE_RULES } from '@ragab/server';
import { authService, registerSchema } from '@ragab/server/modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  auth: 'none',
  csrf: false, // pre-session: same-origin enforced by middleware; native clients are exempt
  rateLimit: RATE_RULES.register,
  bodySchema: registerSchema,
  successStatus: 201,
  handler: async ({ body, ctx }) => {
    const user = await authService.register(body, ctx);
    // Native clients receive { user, session }; browsers receive the bare User + cookie.
    const session = authService.nativeSession(ctx);
    return session ? { user, session } : user;
  },
});
