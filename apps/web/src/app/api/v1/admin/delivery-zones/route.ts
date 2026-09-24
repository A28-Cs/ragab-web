import { defineRoute } from '@ragab/server';
import { shippingService, deliveryZoneUpsertSchema } from '@ragab/server/modules/shipping';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Every zone, including inactive ones — the admin view. */
export const GET = defineRoute({
  method: 'GET',
  permission: { resource: 'settings', action: 'view' },
  handler: () => shippingService.listZonesAdmin(),
});

export const POST = defineRoute({
  method: 'POST',
  permission: { resource: 'settings', action: 'edit' },
  bodySchema: deliveryZoneUpsertSchema,
  successStatus: 201,
  handler: ({ body, ctx }) => shippingService.createZone(ctx, body),
});
