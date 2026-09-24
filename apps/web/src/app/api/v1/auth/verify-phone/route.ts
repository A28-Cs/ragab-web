import { defineRoute, RATE_RULES } from '@ragab/server';
import { authService, verifyOtpSchema } from '@ragab/server/modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  auth: 'required',
  rateLimit: RATE_RULES.otp,
  bodySchema: verifyOtpSchema,
  handler: async ({ body, ctx }) => {
    await authService.verifyPhone(body.code, ctx);
    return { ok: true };
  },
});
