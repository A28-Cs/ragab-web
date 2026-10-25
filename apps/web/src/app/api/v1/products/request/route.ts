import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { inventoryService } from '@ragab/server/modules/inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const productRequestSchema = z.object({
  productId: z.string().min(1).max(64),
  variantId: z.string().min(1).max(64).optional(),
  customerName: z.string().trim().min(2).max(100),
  customerPhone: z.string().trim().min(7).max(20),
  notes: z.string().trim().max(300).optional(),
});

export const POST = defineRoute({
  method: 'POST',
  auth: 'optional',
  bodySchema: productRequestSchema,
  handler: ({ body, ctx }) => inventoryService.createProductRequest(body, ctx),
});
