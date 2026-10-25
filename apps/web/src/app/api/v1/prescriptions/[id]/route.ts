import { z } from 'zod';
import { defineRoute, NotFoundError } from '@ragab/server';
import { getPrescriptionById } from '@ragab/server/modules/prescriptions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  method: 'GET',
  auth: 'optional',
  paramsSchema: z.object({
    id: z.string().min(1),
  }),
  handler: async ({ params }) => {
    if (!params?.id) {
      throw new NotFoundError({
        code: 'PRESCRIPTION_NOT_FOUND',
        message: { ar: 'الروشتة غير موجودة.', en: 'Prescription not found.' },
      });
    }

    return getPrescriptionById(params.id);
  },
});
