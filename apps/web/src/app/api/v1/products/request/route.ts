import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { inventoryService } from '@ragab/server/modules/inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const productRequestSchema = z
  .object({
    productId: z.string().min(1).max(64).optional(),
    productName: z.string().trim().min(2).max(200).optional(),
    variantId: z.string().min(1).max(64).optional(),
    customerName: z.string().trim().max(100).optional(),
    customerPhone: z.string().trim().max(30).optional(),
    imageUrl: z.string().trim().optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((d) => Boolean(d.productId || d.productName), {
    message: 'يجب تحديد اسم المنتج أو معرّف المنتج.',
  });

export const POST = defineRoute({
  method: 'POST',
  auth: 'optional',
  bodySchema: productRequestSchema,
  handler: ({ body, ctx }) => inventoryService.createProductRequest(body, ctx),
});
