import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { credentialsService, setCredentialsSchema } from '@ragab/server/modules/credentials';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PUT = defineRoute({
  method: 'PUT',
  permission: { resource: 'integrations', action: 'manage' },
  paramsSchema: z.object({ provider: z.enum(['paymob', 'smtp', 's3', 'sms']) }),
  bodySchema: setCredentialsSchema,
  handler: ({ params, body, ctx }) => credentialsService.setCredentials(ctx, params.provider, body.values),
});
