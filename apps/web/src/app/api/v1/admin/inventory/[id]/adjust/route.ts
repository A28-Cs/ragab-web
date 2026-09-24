import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { inventoryService } from '@ragab/server/modules/inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Absolute stock set: `quantity` is the new on-hand count, not a delta (both the web and
 * the mobile admin send the same shape). `reason` is optional free text for the ledger.
 */
export const POST = defineRoute({
  method: 'POST',
  permission: { resource: 'inventory', action: 'edit' },
  paramsSchema: z.object({ id: z.string().min(1).max(64) }),
  bodySchema: z.object({
    quantity: z.number().int().min(0).max(1000000),
    reason: z.string().trim().max(200).optional(),
    /** Which sellable unit; omitted ⇒ the product's default variant. */
    variantId: z.string().min(1).max(64).optional(),
  }).strict(),
  handler: ({ params, body, ctx }) => inventoryService.adjustStock(params.id, body.quantity, body.reason || 'manual adjustment', ctx, body.variantId),
});
