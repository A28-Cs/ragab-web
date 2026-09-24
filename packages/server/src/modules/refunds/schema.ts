import { z } from 'zod';

export const refundSchema = z.object({
  orderId: z.string().min(1).max(64),
  amountMinor: z.number().int().positive().max(100_000_000).optional(),
  reason: z.string().max(500).optional(),
  reauthPassword: z.string().min(1).max(200),
}).strict();
