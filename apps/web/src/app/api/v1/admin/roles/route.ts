import { defineRoute } from '@ragab/server';
import { roleService, roleUpsertSchema } from '@ragab/server/modules/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({ method: 'GET', permission: { resource: 'roles', action: 'view' }, handler: () => roleService.listRoles() });
export const POST = defineRoute({ method: 'POST', permission: { resource: 'roles', action: 'create' }, bodySchema: roleUpsertSchema, successStatus: 201, handler: ({ body, ctx }) => roleService.saveRole(ctx, body) });
