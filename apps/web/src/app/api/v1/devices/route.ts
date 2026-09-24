import { defineRoute, RATE_RULES } from '@ragab/server';
import { deviceService, registerDeviceSchema, unregisterDeviceSchema } from '@ragab/server/modules/devices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Register / refresh this device's push token (§26).
export const POST = defineRoute({
  method: 'POST',
  auth: 'required',
  rateLimit: RATE_RULES.writeApi,
  bodySchema: registerDeviceSchema,
  handler: ({ body, ctx }) => deviceService.registerDevice(ctx, body),
});

// Remove this device's push token on logout (§26 cleanup).
export const DELETE = defineRoute({
  method: 'DELETE',
  auth: 'required',
  rateLimit: RATE_RULES.writeApi,
  bodySchema: unregisterDeviceSchema,
  handler: ({ body, ctx }) => deviceService.unregisterDevice(ctx, body.token),
});
