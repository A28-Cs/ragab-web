import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { inventoryService } from '@ragab/server/modules/inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bulkAdjustSchema = z.object({
  quantity: z.number().int().min(0).max(1000000),
  reason: z.string().trim().max(200).optional(),
  items: z.array(z.object({
    productId: z.string().min(1).max(64),
    variantId: z.string().min(1).max(64).optional(),
  })).optional(),
  productIds: z.array(z.string().min(1).max(64)).optional(),
  categoryId: z.string().min(1).max(64).optional(),
});

export const POST = defineRoute({
  method: 'POST',
  permission: { resource: 'inventory', action: 'edit' },
  bodySchema: bulkAdjustSchema,
  handler: ({ body, ctx }) => inventoryService.bulkAdjustStock(body, ctx),
});
