import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { shippingService, deliveryZonePatchSchema } from '@ragab/server/modules/shipping';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(64) });

export const PATCH = defineRoute({
  method: 'PATCH',
  permission: { resource: 'settings', action: 'edit' },
  paramsSchema: params,
  bodySchema: deliveryZonePatchSchema,
  handler: ({ params, body, ctx }) => shippingService.updateZone(ctx, params.id, body),
});

/** Soft delete: the zone disappears from pickers; orders that used it keep their snapshot. */
export const DELETE = defineRoute({
  method: 'DELETE',
  permission: { resource: 'settings', action: 'edit' },
  paramsSchema: params,
  handler: ({ params, ctx }) => shippingService.deleteZone(ctx, params.id),
});
