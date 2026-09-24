import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { testProvider } from '@ragab/server/modules/credentials';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  permission: { resource: 'integrations', action: 'manage' },
  paramsSchema: z.object({ provider: z.enum(['paymob', 'smtp', 's3', 'sms']) }),
  handler: ({ params }) => testProvider(params.provider),
});
