import { defineRoute } from '@ragab/server';
import { authService } from '@ragab/server/modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  method: 'GET',
  auth: 'required',
  handler: ({ ctx }) => authService.me(ctx),
});
