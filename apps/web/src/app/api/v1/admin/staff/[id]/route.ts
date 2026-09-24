import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { staffService, staffUpdateSchema } from '@ragab/server/modules/staff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = defineRoute({ method: 'PATCH', permission: { resource: 'users', action: 'edit' }, paramsSchema: z.object({ id: z.string().min(1).max(64) }), bodySchema: staffUpdateSchema, handler: ({ params, body, ctx }) => staffService.updateStaff(ctx, params.id, body) });
