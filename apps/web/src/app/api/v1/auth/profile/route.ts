import { defineRoute } from '@ragab/server';
import { authService, updateProfileSchema } from '@ragab/server/modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = defineRoute({ method: 'PATCH', auth: 'required', bodySchema: updateProfileSchema, handler: ({ body, ctx }) => authService.updateProfile(ctx, body) });
