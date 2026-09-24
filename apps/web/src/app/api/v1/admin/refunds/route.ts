import { defineRoute } from '@ragab/server';
import { refundService, refundSchema } from '@ragab/server/modules/refunds';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  permission: { resource: 'payments', action: 'approve' },
  bodySchema: refundSchema,
  handler: ({ body, ctx }) => refundService.issueRefund(ctx, body),
});
