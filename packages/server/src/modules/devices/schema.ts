/**
 * Device (push token) input schemas (§26). `.strict()` mass-assignment defense (§15).
 */
import { z } from 'zod';

export const registerDeviceSchema = z
  .object({
    token: z.string().min(10).max(4096),
    platform: z.enum(['android', 'ios', 'web']),
    appVersion: z.string().max(40).optional(),
  })
  .strict();

export const unregisterDeviceSchema = z.object({ token: z.string().min(10).max(4096) }).strict();

export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
export type UnregisterDeviceInput = z.infer<typeof unregisterDeviceSchema>;
