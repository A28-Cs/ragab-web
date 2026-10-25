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

    if (!data.imageUrl?.trim()) {
      throw new ValidationError({
        code: 'IMAGE_REQUIRED',
        message: {
          ar: 'يرجى رفع صورة الروشتة.',
          en: 'Prescription image is required.',
        },
      });
    }

    const userName = (ctx.principal as any)?.user?.name;
    const userPhone = (ctx.principal as any)?.user?.phone;

    return createPrescription({
      userId: ctx.principal?.userId ?? null,
      customerName: data.customerName?.trim() || userName || 'عميل',
      customerPhone: data.customerPhone?.trim() || userPhone || '-',
      imageUrl: data.imageUrl.trim(),
      notes: data.notes?.trim() || undefined,
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
