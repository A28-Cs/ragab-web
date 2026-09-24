import { z } from 'zod';

export const quoteSchema = z.object({
  addressId: z.string().min(1).max(64),
  couponCode: z.string().trim().max(40).optional(),
}).strict();

export const checkoutSchema = z.object({
  addressId: z.string().min(1).max(64),
  paymentMethod: z.enum(['cod', 'vodafone_cash', 'instapay']),
  couponCode: z.string().trim().max(40).optional(),
  notes: z.string().max(1000).optional(),
}).strict();
