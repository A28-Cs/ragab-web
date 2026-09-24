import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { toggleIntegration } from '@ragab/server/modules/integrations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = defineRoute({
  method: 'PATCH',
  permission: { resource: 'integrations', action: 'edit' },
  paramsSchema: z.object({ id: z.string().min(1).max(64) }),
  bodySchema: z.object({ enabled: z.boolean() }).strict(),
  handler: async ({ params, body, ctx }) => { await toggleIntegration(ctx, params.id, body.enabled); return { ok: true }; },
});
