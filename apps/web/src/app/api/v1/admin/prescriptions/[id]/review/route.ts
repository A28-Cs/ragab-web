import { defineRoute, ValidationError } from '@ragab/server';
import { z } from 'zod';
import { reviewPrescription } from '@ragab/server/modules/prescriptions';
import type { PrescriptionItem } from '@ragab/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  permission: { resource: 'orders', action: 'edit' },
  paramsSchema: z.object({ id: z.string().min(1) }),
  handler: async ({ params, body, ctx }) => {
    const payload = (body ?? {}) as unknown as {
      items?: PrescriptionItem[];
      pharmacistNotes?: string;
      addToCart?: boolean;
    };

    if (!payload.items || payload.items.length === 0) {
      throw new ValidationError({
        code: 'ITEMS_REQUIRED',
        message: {
          ar: 'يرجى تحديد الأدوية المطلوبة في الروشتة.',
          en: 'Please select prescribed medications.',
        },
      });
    }

    return reviewPrescription({
      id: params.id,
      items: payload.items,
      pharmacistNotes: payload.pharmacistNotes,
      reviewerId: ctx.principal?.userId,
      addToCart: payload.addToCart !== false,
    });
  },
});
