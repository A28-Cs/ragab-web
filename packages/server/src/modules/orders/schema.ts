import { z } from 'zod';
import { MAX_PAGE_SIZE } from '../../lib/pagination';

export const orderListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
  cursor: z.string().max(512).optional(),
  status: z.enum(['pending', 'preparing', 'on_the_way', 'delivered', 'cancelled']).optional(),
  /** Order number, recipient name or phone (case-insensitive substring). */
  q: z.string().trim().max(80).optional(),
}).strict();

export const updateStatusSchema = z.object({
  status: z.enum(['pending', 'preparing', 'on_the_way', 'delivered', 'cancelled']),
}).strict();

/** Staff correction of the delivery snapshot (typo in the street, wrong phone) before dispatch. */
export const updateDeliverySchema = z.object({
  recipientName: z.string().trim().min(1).max(120),
  phone: z.string().trim().regex(/^01[0125]\d{8}$/),
  village: z.string().trim().min(1).max(120),
  streetAddress: z.string().trim().min(1).max(300),
  landmark: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(300).optional(),
}).strict();

/** Staff assigns/updates who is delivering an order — upserts the `shipments` row. */
export const assignCourierSchema = z.object({
  driverName: z.string().trim().min(1).max(120),
  driverPhone: z.string().trim().regex(/^01[0125]\d{8}$/),
}).strict();

export const manualOrderSchema = z.object({
  lines: z.array(z.object({ productId: z.string().min(1).max(64), quantity: z.number().int().min(1).max(999) })).min(1).max(100),
  paymentMethod: z.enum(['cod', 'vodafone_cash', 'instapay']),
  deliveryAddress: z.object({
    recipientName: z.string().min(1).max(120),
    phone: z.string().min(3).max(20),
    village: z.string().min(1).max(120),
    streetAddress: z.string().min(1).max(300),
    title: z.string().max(120).optional(),
    landmark: z.string().max(200).optional(),
    notes: z.string().max(300).optional(),
  }).passthrough(),
  discount: z.number().min(0).max(1000000).optional(),
}).strict();
