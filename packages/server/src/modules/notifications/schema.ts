/**
 * Notification preference toggles (§23/§26). Mirrors exactly the channels the
 * `notification_preferences` table stores — order has email/sms/push, promo and security
 * have email/push (no SMS). All keys optional so PATCH is a partial update; `.strict()`
 * rejects unknown keys (mass-assignment defense, §15).
 */
import { z } from 'zod';

export const notificationPreferencesSchema = z
  .object({
    orderEmail: z.boolean(),
    orderSms: z.boolean(),
    orderPush: z.boolean(),
    promoEmail: z.boolean(),
    promoPush: z.boolean(),
    securityEmail: z.boolean(),
    securityPush: z.boolean(),
  })
  .partial()
  .strict();

export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;
