import { defineRoute, ValidationError } from '@ragab/server';
import { z } from 'zod';
import { getPrescriptionById } from '@ragab/server/modules/prescriptions';
import { cartService } from '@ragab/server/modules/cart';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  auth: 'optional',
  paramsSchema: z.object({ id: z.string().min(1) }),
  handler: async ({ params, ctx }) => {
    const rx = await getPrescriptionById(params.id);
    if (!rx.items || rx.items.length === 0) {
      throw new ValidationError({
        code: 'NO_ITEMS',
        message: {
          ar: 'لم يتم تحديد أدوية في هذه الروشتة بعد.',
          en: 'No medications have been identified in this prescription yet.',
        },
      });
    }

    let cart;
    for (const item of rx.items) {
      cart = await cartService.addToCart(ctx, item.productId, item.quantity || 1, item.variantId);
    }

    return { ok: true, cart, addedCount: rx.items.length };
  },
});
