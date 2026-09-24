import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { listAuditLogs } from '@ragab/server/modules/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({ method: 'GET', permission: { resource: 'audit', action: 'view' }, querySchema: z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), cursor: z.string().max(512).optional(), resource: z.string().max(40).optional() }), handler: ({ query }) => listAuditLogs(query) });
