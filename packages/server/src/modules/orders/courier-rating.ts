import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { courierRatings, orders, shipments } from '../../db/schema';
import { AuthenticationError, NotFoundError, ValidationError } from '../../lib/errors';
import type { RequestContext } from '../../http/context';
import { prefixedId } from '../../lib/ids';
import { logger } from '../../lib/logger';
import { getEngeznyFirestore } from '../../integrations/engezny/firebase';

const log = logger().child({ component: 'courier-rating' });

export interface SubmitCourierRatingInput {
  orderId: string;
  rating: number;
  comment?: string;
}

export interface CourierRatingDto {
  id: string;
  orderId: string;
  driverName?: string | null;
  driverPhone?: string | null;
  workerId?: string | null;
  rating: number;
  comment?: string | null;
  createdAt: string;
}

export async function submitCourierRating(
  ctx: RequestContext,
  input: SubmitCourierRatingInput
): Promise<CourierRatingDto> {
  if (!ctx.principal) {
    throw new AuthenticationError({
      message: { ar: 'يجب تسجيل الدخول لتقييم المندوب.', en: 'You must be signed in to rate the courier.' },
    });
  }

  const rating = Math.round(input.rating);
  if (rating < 1 || rating > 5) {
    throw new ValidationError({
      message: { ar: 'التقييم يجب أن يكون بين 1 و 5 نجوم.', en: 'Rating must be between 1 and 5 stars.' },
    });
  }

  const [order] = await db()
    .select()
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .limit(1);

  if (!order) {
    throw new NotFoundError({
      code: 'ORDER_NOT_FOUND',
      message: { ar: 'الطلب غير موجود.', en: 'Order not found.' },
    });
  }

  const isOwner = order.userId === ctx.principal.userId;
  const isStaff = Boolean(ctx.principal.isStaff);
  if (!isOwner && !isStaff) {
    throw new AuthenticationError({
      message: { ar: 'لا تملك صلاحية تقييم هذا الطلب.', en: 'Not authorized to rate this order.' },
    });
  }

  if (order.status !== 'delivered') {
    throw new ValidationError({
      message: { ar: 'يمكنك تقييم المندوب بعد اكتمال التوصيل فقط.', en: 'You can only rate the courier after delivery is completed.' },
    });
  }

  // Find courier info from shipments or Engezny
  const [shipment] = await db()
    .select()
    .from(shipments)
    .where(eq(shipments.orderId, order.id))
    .limit(1);

  let driverName = shipment?.driverName ?? null;
  let driverPhone = shipment?.driverPhone ?? null;
  let workerId: string | null = null;

  // Retrieve workerId from Engezny Firestore if possible
  const firestore = getEngeznyFirestore();
  if (firestore) {
    try {
      let docSnap = await firestore.collection('orders').doc(order.id).get();
      let d = docSnap.exists ? docSnap.data() : null;
      if (!d) {
        const q = await firestore.collection('orders').where('ragabOrderId', '==', order.id).limit(1).get();
        if (!q.empty) d = q.docs[0].data();
      }
      if (!d) {
        const q2 = await firestore.collection('orders').where('mahsoobOrderId', '==', order.id).limit(1).get();
        if (!q2.empty) d = q2.docs[0].data();
      }
      if (d) {
        if (!driverName && d.workerName) driverName = d.workerName;
        if (!driverPhone && d.workerPhone) driverPhone = d.workerPhone;
        if (d.workerId) workerId = d.workerId;
      }
    } catch (err) {
      log.warn({ err }, 'Could not read order from Engezny for courier rating');
    }
  }

  const id = prefixedId('crat');
  const [saved] = await db()
    .insert(courierRatings)
    .values({
      id,
      orderId: order.id,
      userId: ctx.principal.userId,
      driverName: driverName || 'مندوب التوصيل',
      driverPhone,
      workerId,
      rating,
      comment: input.comment?.trim() || null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [courierRatings.orderId],
      set: {
        rating,
        comment: input.comment?.trim() || null,
        driverName: driverName || courierRatings.driverName,
        driverPhone: driverPhone || courierRatings.driverPhone,
        workerId: workerId || courierRatings.workerId,
        updatedAt: new Date(),
      },
    })
    .returning();

  // Sync rating to Engezny Firestore in background/safely
  if (firestore) {
    try {
      // 1. Locate the exact order document in Engezny
      let orderRef = firestore.collection('orders').doc(order.id);
      let orderDoc = await orderRef.get();
      if (!orderDoc.exists) {
        const q = await firestore.collection('orders').where('ragabOrderId', '==', order.id).limit(1).get();
        if (!q.empty) {
          orderDoc = q.docs[0];
          orderRef = orderDoc.ref;
        }
      }
      if (!orderDoc.exists) {
        const q2 = await firestore.collection('orders').where('mahsoobOrderId', '==', order.id).limit(1).get();
        if (!q2.empty) {
          orderDoc = q2.docs[0];
          orderRef = orderDoc.ref;
        }
      }

      if (orderDoc.exists) {
        // Set the exact customer rating on the Engezny order doc
        await orderRef.set(
          {
            rating: rating,
            driverRating: rating,
            workerRating: rating,
            courierRating: rating,
            customerRating: rating,
            deliveryRating: rating,
            review: input.comment?.trim() || '',
            driverReview: input.comment?.trim() || '',
            customerFeedback: input.comment?.trim() || '',
            driverFeedback: input.comment?.trim() || '',
            rated: true,
            isRated: true,
            driverRated: true,
            ratedAt: new Date(),
            driverRatedAt: new Date(),
          },
          { merge: true }
        );
      }

      // 2. Update the driver worker document in Engezny users collection
      const orderData = orderDoc.exists ? orderDoc.data() : null;
      const effectiveWorkerId =
        workerId ||
        orderData?.workerId ||
        orderData?.driverId ||
        orderData?.courierId ||
        orderData?.assignedWorkerId;

      if (effectiveWorkerId) {
        const workerRef = firestore.collection('users').doc(effectiveWorkerId);
        const workerSnap = await workerRef.get();
        if (workerSnap.exists) {
          const w = workerSnap.data() || {};
          const currentCount = Number(w.ratingCount || w.totalRatings || w.ratingsCount || 0);
          const currentRating = Number(w.rating ?? 5);
          const newCount = currentCount + 1;
          // Calculate exact real weighted average based on the customer's true rating
          const newRating =
            currentCount === 0
              ? rating
              : Number(((currentRating * currentCount + rating) / newCount).toFixed(2));

          await workerRef.set(
            {
              rating: newRating,
              workerRating: newRating,
              driverRating: newRating,
              ratingCount: newCount,
              totalRatings: newCount,
              ratingsCount: newCount,
              lastRating: rating,
              lastRatingFromRagab: rating,
              lastRatedAt: new Date(),
            },
            { merge: true }
          );

          // Also record in worker's ratings subcollection in Engezny
          try {
            await workerRef.collection('ratings').doc(order.id).set(
              {
                orderId: order.id,
                rating: rating,
                comment: input.comment?.trim() || '',
                createdAt: new Date(),
                source: 'ragab_pharmacy',
                customerName: ctx.principal.user?.name || 'عميل صيدلية رجب',
              },
              { merge: true }
            );
          } catch {
            // ignore subcollection write failure
          }

          log.info(
            { workerId: effectiveWorkerId, customerRating: rating, newRating, newCount },
            'Synced exact courier rating to Engezny worker profile without automatic 0.2 increment'
          );
        }
      }

      // 3. Record in root ratings collection if Engezny uses global ratings
      try {
        await firestore.collection('ratings').doc(`ragab_${order.id}`).set(
          {
            orderId: order.id,
            workerId: effectiveWorkerId || null,
            rating: rating,
            comment: input.comment?.trim() || '',
            createdAt: new Date(),
            source: 'ragab_pharmacy',
          },
          { merge: true }
        );
      } catch {
        // ignore root rating collection write failure
      }
    } catch (err) {
      log.error({ err, orderId: order.id }, 'Failed to sync courier rating to Engezny Firestore');
    }
  }

  return {
    id: saved.id,
    orderId: saved.orderId,
    driverName: saved.driverName,
    driverPhone: saved.driverPhone,
    workerId: saved.workerId,
    rating: saved.rating,
    comment: saved.comment,
    createdAt: saved.createdAt.toISOString(),
  };
}

export async function getCourierRating(orderId: string): Promise<CourierRatingDto | null> {
  const [row] = await db()
    .select()
    .from(courierRatings)
    .where(eq(courierRatings.orderId, orderId))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    orderId: row.orderId,
    driverName: row.driverName,
    driverPhone: row.driverPhone,
    workerId: row.workerId,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
  };
}
