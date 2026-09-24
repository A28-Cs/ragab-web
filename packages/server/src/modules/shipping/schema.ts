import { z } from 'zod';

/** Admin create/update of a delivery zone. Money in MAJOR units (EGP) as the UI edits it. */
export const deliveryZoneUpsertSchema = z
  .object({
    nameAr: z.string().trim().min(1).max(120),
    nameEn: z.string().trim().min(1).max(120),
    deliveryFee: z.number().min(0).max(100000),
    minOrder: z.number().min(0).max(1000000).default(0),
    estimatedTimeAr: z.string().trim().max(120).default(''),
    estimatedTimeEn: z.string().trim().max(120).default(''),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(10000).default(0),
  })
  .strict();

export type DeliveryZoneUpsertInput = z.infer<typeof deliveryZoneUpsertSchema>;

/** PATCH: every field optional. */
export const deliveryZonePatchSchema = deliveryZoneUpsertSchema.partial().strict();
export type DeliveryZonePatchInput = z.infer<typeof deliveryZonePatchSchema>;
