import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  prescriptions,
  carts,
  cartItems,
  notifications,
  productVariants,
} from '../../db/schema';
import { prefixedId } from '../../lib/ids';
import { publishEvent } from '../../lib/events';
import { logger } from '../../lib/logger';
import { NotFoundError, ValidationError } from '../../lib/errors';
import type { Prescription, PrescriptionItem, PrescriptionStatus } from '@ragab/types';
import type { RequestContext } from '../../http/context';

export interface CreatePrescriptionInput {
  userId?: string | null;
  customerName: string;
  customerPhone: string;
  imageUrl: string;
  notes?: string;
}

export interface ReviewPrescriptionInput {
  id: string;
  items: PrescriptionItem[];
  pharmacistNotes?: string;
  reviewerId?: string;
  addToCart?: boolean;
}

export async function ensurePrescriptionsTable() {
  try {
    await db().execute(sql`
      DO $$ BEGIN
        CREATE TYPE "prescription_status" AS ENUM('pending', 'reviewed', 'completed', 'rejected');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      CREATE TABLE IF NOT EXISTS "prescriptions" (
        "id" text PRIMARY KEY,
        "user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
        "customer_name" text NOT NULL,
        "customer_phone" text NOT NULL,
        "image_url" text NOT NULL,
        "notes" text,
        "status" "prescription_status" NOT NULL DEFAULT 'pending',
        "items" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "pharmacist_notes" text,
        "reviewed_by" text,
        "reviewed_at" timestamptz,
        "rejection_reason" text,
        "cart_updated" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS "prescriptions_user_idx" ON "prescriptions"("user_id");
      CREATE INDEX IF NOT EXISTS "prescriptions_status_idx" ON "prescriptions"("status");
      CREATE INDEX IF NOT EXISTS "prescriptions_created_idx" ON "prescriptions"("created_at");
    `);
  } catch (e) {
    logger().warn({ err: e }, 'ensurePrescriptionsTable notice');
  }
}

function mapPrescription(r: typeof prescriptions.$inferSelect): Prescription {
  return {
    id: r.id,
    userId: r.userId ?? undefined,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    imageUrl: r.imageUrl,
    notes: r.notes ?? undefined,
    status: r.status as PrescriptionStatus,
    items: (Array.isArray(r.items) ? r.items : []) as PrescriptionItem[],
    pharmacistNotes: r.pharmacistNotes ?? undefined,
    reviewedBy: r.reviewedBy ?? undefined,
    reviewedAt: r.reviewedAt?.toISOString(),
    rejectionReason: r.rejectionReason ?? undefined,
    cartUpdated: r.cartUpdated ?? false,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function createPrescription(input: CreatePrescriptionInput): Promise<{ ok: boolean; id: string }> {
  await ensurePrescriptionsTable();

  if (!input.customerName?.trim()) {
    throw new ValidationError({
      code: 'CUSTOMER_NAME_REQUIRED',
      message: { ar: 'يرجى إدخال اسم العميل.', en: 'Customer name is required.' },
    });
  }
  if (!input.customerPhone?.trim()) {
    throw new ValidationError({
      code: 'CUSTOMER_PHONE_REQUIRED',
      message: { ar: 'يرجى إدخال رقم الهاتف.', en: 'Customer phone is required.' },
    });
  }
  if (!input.imageUrl?.trim()) {
    throw new ValidationError({
      code: 'IMAGE_REQUIRED',
      message: { ar: 'يرجى رفع صورة الروشتة.', en: 'Prescription image is required.' },
    });
  }

  const id = prefixedId('rx');
  await db().insert(prescriptions).values({
    id,
    userId: input.userId ?? null,
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone.trim(),
    imageUrl: input.imageUrl.trim(),
    notes: input.notes?.trim() || null,
    status: 'pending',
    items: [],
  });

  // Notify pharmacy staff in realtime
  try {
    await publishEvent('admin_orders', {
      event: 'prescription.created',
      topic: 'admin_orders',
      eventId: prefixedId('evt'),
      timestamp: new Date().toISOString(),
      version: 1,
      data: {
        prescriptionId: id,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone.trim(),
      },
    });
  } catch (err) {
    logger().warn({ err }, 'Failed to publish prescription.created event');
  }

  return { ok: true, id };
}

export async function listPrescriptions(status?: string): Promise<Prescription[]> {
  await ensurePrescriptionsTable();
  const query = db().select().from(prescriptions);
  if (status && status !== 'all') {
    query.where(eq(prescriptions.status, status as any));
  }
  const rows = await query.orderBy(desc(prescriptions.createdAt)).limit(100);
  return rows.map(mapPrescription);
}

export async function getCustomerPrescriptions(userId: string): Promise<Prescription[]> {
  await ensurePrescriptionsTable();
  const rows = await db()
    .select()
    .from(prescriptions)
    .where(eq(prescriptions.userId, userId))
    .orderBy(desc(prescriptions.createdAt))
    .limit(50);
  return rows.map(mapPrescription);
}

export async function getPrescriptionById(id: string): Promise<Prescription> {
  await ensurePrescriptionsTable();
  const [row] = await db()
    .select()
    .from(prescriptions)
    .where(eq(prescriptions.id, id))
    .limit(1);

  if (!row) {
    throw new NotFoundError({
      code: 'PRESCRIPTION_NOT_FOUND',
      message: { ar: 'الروشتة غير موجودة.', en: 'Prescription not found.' },
    });
  }
  return mapPrescription(row);
}

async function getDefaultVariantId(productId: string): Promise<string | null> {
  const [variant] = await db()
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(and(eq(productVariants.productId, productId), eq(productVariants.isActive, true)))
    .orderBy(desc(productVariants.isDefault))
    .limit(1);
  return variant?.id ?? null;
}

async function addItemsToUserCart(userId: string, items: PrescriptionItem[]): Promise<boolean> {
  try {
    let [cart] = await db()
      .select()
      .from(carts)
      .where(and(eq(carts.userId, userId), eq(carts.status, 'active')))
      .limit(1);

    if (!cart) {
      const cartId = prefixedId('cart');
      const [inserted] = await db()
        .insert(carts)
        .values({ id: cartId, userId, status: 'active' })
        .onConflictDoNothing()
        .returning();
      if (!inserted) {
        [cart] = await db()
          .select()
          .from(carts)
          .where(and(eq(carts.userId, userId), eq(carts.status, 'active')))
          .limit(1);
      } else {
        cart = inserted;
      }
    }

    if (!cart) return false;

    for (const item of items) {
      if (!item.productId || item.quantity <= 0) continue;
      const variantId = item.variantId || (await getDefaultVariantId(item.productId));
      if (!variantId) continue;

      await db()
        .insert(cartItems)
        .values({
          id: prefixedId('ci'),
          cartId: cart.id,
          productId: item.productId,
          variantId,
          quantity: Math.min(item.quantity, 99),
        })
        .onConflictDoUpdate({
          target: [cartItems.cartId, cartItems.productId, cartItems.variantId],
          set: {
            quantity: sql`LEAST(${cartItems.quantity} + ${item.quantity}, 99)`,
          },
        });
    }
    return true;
  } catch (err) {
    logger().error({ err, userId }, 'Failed to add prescription items to user cart');
    return false;
  }
}

export async function reviewPrescription(input: ReviewPrescriptionInput): Promise<Prescription> {
  await ensurePrescriptionsTable();
  const [existing] = await db()
    .select()
    .from(prescriptions)
    .where(eq(prescriptions.id, input.id))
    .limit(1);

  if (!existing) {
    throw new NotFoundError({
      code: 'PRESCRIPTION_NOT_FOUND',
      message: { ar: 'الروشتة غير موجودة.', en: 'Prescription not found.' },
    });
  }

  if (!input.items || input.items.length === 0) {
    throw new ValidationError({
      code: 'ITEMS_REQUIRED',
      message: { ar: 'يرجى اختيار دواء واحد على الأقل من المتجر.', en: 'Please select at least one medication from the store.' },
    });
  }

  let cartUpdated = false;
  if (existing.userId && input.addToCart !== false) {
    cartUpdated = await addItemsToUserCart(existing.userId, input.items);
  }

  const now = new Date();
  await db()
    .update(prescriptions)
    .set({
      status: 'reviewed',
      items: input.items,
      pharmacistNotes: input.pharmacistNotes?.trim() || null,
      reviewedBy: input.reviewerId || null,
      reviewedAt: now,
      cartUpdated,
      updatedAt: now,
    })
    .where(eq(prescriptions.id, input.id));

  // If user is registered, create in-app notification
  if (existing.userId) {
    try {
      await db().insert(notifications).values({
        id: prefixedId('notif'),
        userId: existing.userId,
        category: 'order',
        titleAr: 'تم تجهيز روشتتك وإضافتها للسلة 💊',
        titleEn: 'Your prescription is ready in cart 💊',
        bodyAr: `قام الصيدلي بمراجعة روشتتك وتحديد ${input.items.length} صنف وإضافتها إلى سلتك بنجاح. تفضل بإتمام الطلب.`,
        bodyEn: `The pharmacist has reviewed your prescription, identified ${input.items.length} items, and added them to your cart.`,
        href: '/cart',
        read: false,
      });

      await publishEvent('admin_orders', {
        event: 'prescription.reviewed',
        topic: 'admin_orders',
        eventId: prefixedId('evt'),
        timestamp: now.toISOString(),
        version: 1,
        data: {
          prescriptionId: input.id,
          userId: existing.userId,
          itemCount: input.items.length,
          totalAmount: input.items.reduce((s, it) => s + (it.price || 0) * (it.quantity || 1), 0),
        },
      });
    } catch (err) {
      logger().warn({ err }, 'Failed to send in-app notification for prescription');
    }
  }

  const [updated] = await db()
    .select()
    .from(prescriptions)
    .where(eq(prescriptions.id, input.id))
    .limit(1);

  return mapPrescription(updated!);
}

export async function rejectPrescription(id: string, reason: string, reviewerId?: string): Promise<Prescription> {
  await ensurePrescriptionsTable();
  const [existing] = await db()
    .select()
    .from(prescriptions)
    .where(eq(prescriptions.id, id))
    .limit(1);

  if (!existing) {
    throw new NotFoundError({
      code: 'PRESCRIPTION_NOT_FOUND',
      message: { ar: 'الروشتة غير موجودة.', en: 'Prescription not found.' },
    });
  }

  const now = new Date();
  await db()
    .update(prescriptions)
    .set({
      status: 'rejected',
      rejectionReason: reason.trim(),
      reviewedBy: reviewerId || null,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(eq(prescriptions.id, id));

  if (existing.userId) {
    try {
      await db().insert(notifications).values({
        id: prefixedId('notif'),
        userId: existing.userId,
        category: 'order',
        titleAr: 'تحديث بخصوص الروشتة المرسلة',
        titleEn: 'Update regarding your prescription',
        bodyAr: `تمت مراجعة الروشتة ولكن تعذر تنفيذها: ${reason.trim()}`,
        bodyEn: `Your prescription was reviewed but could not be processed: ${reason.trim()}`,
        href: `/prescription?id=${id}`,
        read: false,
      });
    } catch (err) {
      logger().warn({ err }, 'Failed to send prescription rejection notification');
    }
  }

  const [updated] = await db()
    .select()
    .from(prescriptions)
    .where(eq(prescriptions.id, id))
    .limit(1);

  return mapPrescription(updated!);
}

export async function addPrescriptionToCallerCart(userId: string, prescriptionId: string): Promise<{ count: number }> {
  const prescription = await getPrescriptionById(prescriptionId);
  if (!prescription.items || prescription.items.length === 0) {
    throw new ValidationError({
      code: 'NO_ITEMS_IN_PRESCRIPTION',
      message: { ar: 'الروشتة لا تحتوي على أدوية بعد.', en: 'Prescription has no items yet.' },
    });
  }

  const ok = await addItemsToUserCart(userId, prescription.items);
  if (!ok) {
    throw new ValidationError({
      code: 'CART_ADD_FAILED',
      message: { ar: 'تعذر إضافة الأدوية إلى السلة.', en: 'Failed to add items to cart.' },
    });
  }

  return { count: prescription.items.length };
}
