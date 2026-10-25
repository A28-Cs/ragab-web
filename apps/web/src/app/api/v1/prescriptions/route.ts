import { defineRoute, ValidationError } from '@ragab/server';
import {
  createPrescription,
  getCustomerPrescriptions,
} from '@ragab/server/modules/prescriptions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  auth: 'optional',
  handler: async ({ body, ctx }) => {
    const data = (body ?? {}) as unknown as {
      customerName?: string;
      customerPhone?: string;
      imageUrl?: string;
      notes?: string;
    };

    if (!data.customerName || !data.customerPhone || !data.imageUrl) {
      throw new ValidationError({
        code: 'MISSING_FIELDS',
        message: {
          ar: 'الاسم ورقم الهاتف وصورة الروشتة حقول مطلوبة.',
          en: 'Name, phone number, and prescription image are required.',
        },
      });
    }

    return createPrescription({
      userId: ctx.principal?.userId ?? null,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      imageUrl: data.imageUrl,
      notes: data.notes,
    });
  },
});

export const GET = defineRoute({
  method: 'GET',
  auth: 'required',
  handler: async ({ ctx }) => {
    return getCustomerPrescriptions(ctx.principal!.userId);
  },
});
