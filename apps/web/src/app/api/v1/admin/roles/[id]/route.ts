import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { roleService, roleUpsertSchema } from '@ragab/server/modules/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const p = z.object({ id: z.string().min(1).max(64) });
export const PUT = defineRoute({ method: 'PUT', permission: { resource: 'roles', action: 'edit' }, paramsSchema: p, bodySchema: roleUpsertSchema, handler: ({ params, body, ctx }) => roleService.saveRole(ctx, body, params.id) });
export const DELETE = defineRoute({ method: 'DELETE', permission: { resource: 'roles', action: 'delete' }, paramsSchema: p, handler: async ({ params, ctx }) => { await roleService.deleteRole(ctx, params.id); return { ok: true }; } });
