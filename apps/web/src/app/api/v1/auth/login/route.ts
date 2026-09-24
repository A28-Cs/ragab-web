import { defineRoute, RATE_RULES } from '@ragab/server';
import { authService, loginSchema } from '@ragab/server/modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  auth: 'none',
  csrf: false, // no session yet; middleware enforces same-origin (native clients are exempt)
  rateLimit: RATE_RULES.login,
  bodySchema: loginSchema,
  handler: async ({ body, ctx }) => {
    const res = await authService.login(body, ctx);
    // Native clients receive the session token in the body; browsers get an HttpOnly cookie.
    const session = authService.nativeSession(ctx);
    return session ? { ...res, session } : res;
  },
});
