import { defineRoute, ValidationError } from '@ragab/server';
import { z } from 'zod';
import { rejectPrescription } from '@ragab/server/modules/prescriptions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  permission: { resource: 'orders', action: 'edit' },
  paramsSchema: z.object({ id: z.string().min(1) }),
  handler: async ({ params, body, ctx }) => {
    const payload = (body ?? {}) as unknown as {
      reason?: string;
    };

    if (!payload.reason || !payload.reason.trim()) {
      throw new ValidationError({
        code: 'REASON_REQUIRED',
        message: {
          ar: 'يرجى كتابة سبب تعذر تنفيذ الروشتة.',
          en: 'Please provide a reason for rejecting the prescription.',
        },
      });
    }

    return rejectPrescription(params.id, payload.reason, ctx.principal?.userId);
  },
});
