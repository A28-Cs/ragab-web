import { defineRoute } from '@ragab/server';
import { staffService, staffCreateSchema } from '@ragab/server/modules/staff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({ method: 'GET', permission: { resource: 'users', action: 'view' }, handler: () => staffService.listStaff() });
export const POST = defineRoute({ method: 'POST', permission: { resource: 'users', action: 'create' }, bodySchema: staffCreateSchema, successStatus: 201, handler: ({ body, ctx }) => staffService.createStaff(ctx, body) });
