import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { reviews, products, orders, orderItems } from '../../db/schema';
import { AuthenticationError, ValidationError, NotFoundError } from '../../lib/errors';
import type { RequestContext } from '../../http/context';

export interface SubmitReviewInput {
  productId: string;
  orderId?: string;
  rating: number;
  title?: string;
  comment?: string;
}

export interface ReviewDto {
  id: string;
  productId: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  isVerifiedPurchase: boolean;
  createdAt: string;
  updatedAt?: string | null;
}

export async function submitReview(ctx: RequestContext, input: SubmitReviewInput): Promise<ReviewDto> {
  if (!ctx.principal) {
    throw new AuthenticationError({
      message: { ar: 'يجب تسجيل الدخول لإضافة تقييم.', en: 'You must be signed in to submit a review.' },
    });
  }

  const userId = ctx.principal.userId;
  const rating = Math.round(input.rating);
  if (rating < 1 || rating > 5) {
    throw new ValidationError({
      message: { ar: 'التقييم يجب أن يكون بين 1 و 5 نجوم.', en: 'Rating must be between 1 and 5 stars.' },
    });
  }

  // Check if product exists
  const [product] = await db()
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, input.productId))
    .limit(1);

  if (!product) {
    throw new NotFoundError({
      code: 'PRODUCT_NOT_FOUND',
      message: { ar: 'المنتج غير موجود.', en: 'Product not found.' },
    });
  }

  // Check verified purchase: user has a delivered order with this product
  let isVerified = false;
  if (input.orderId) {
    const [purchased] = await db()
      .select({ id: orders.id })
      .from(orders)
      .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
      .where(
        and(
          eq(orders.id, input.orderId),
          eq(orders.userId, userId),
          eq(orders.status, 'delivered'),
          eq(orderItems.productId, input.productId),
        ),
      )
      .limit(1);

    if (purchased) isVerified = true;
  } else {
    const [purchased] = await db()
      .select({ id: orders.id })
      .from(orders)
      .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
      .where(
        and(
          eq(orders.userId, userId),
          eq(orders.status, 'delivered'),
          eq(orderItems.productId, input.productId),
        ),
      )
      .limit(1);

    if (purchased) isVerified = true;
  }

  // Upsert review (one review per user per product)
  const [upserted] = await db()
    .insert(reviews)
    .values({
      productId: input.productId,
      userId,
      rating,
      title: input.title?.trim() || null,
      body: input.comment?.trim() || null,
      isVerifiedPurchase: isVerified,
      isApproved: true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [reviews.userId, reviews.productId],
      set: {
        rating,
        title: input.title?.trim() || null,
        body: input.comment?.trim() || null,
        isVerifiedPurchase: isVerified,
        isApproved: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  // Recalculate average rating & review count for the product
  const [stats] = await db()
    .select({
      avgRating: sql<number>`coalesce(avg(${reviews.rating}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(reviews)
    .where(and(eq(reviews.productId, input.productId), eq(reviews.isApproved, true)));

  if (stats) {
    const roundedRating = Math.round(Number(stats.avgRating) * 10) / 10;
    const count = Number(stats.count);
    await db()
      .update(products)
      .set({
        rating: roundedRating,
        reviewCount: count,
        updatedAt: new Date(),
      })
      .where(eq(products.id, input.productId));
  }

  return {
    id: upserted.id,
    productId: upserted.productId,
    rating: upserted.rating,
    title: upserted.title,
    body: upserted.body,
    isVerifiedPurchase: upserted.isVerifiedPurchase,
    createdAt: upserted.createdAt.toISOString(),
    updatedAt: upserted.updatedAt?.toISOString() ?? null,
  };
}

export async function getOrderReviews(ctx: RequestContext, orderId: string): Promise<ReviewDto[]> {
  if (!ctx.principal) {
    return [];
  }

  const userId = ctx.principal.userId;

  // Find products in this order
  const items = await db()
    .select({ productId: orderItems.productId })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)));

  const productIds = items
    .map((it) => it.productId)
    .filter((id): id is string => Boolean(id));

  if (productIds.length === 0) {
    return [];
  }

  const userReviews = await db()
    .select()
    .from(reviews)
    .where(and(eq(reviews.userId, userId), inArray(reviews.productId, productIds)));

  return userReviews.map((r) => ({
    id: r.id,
    productId: r.productId,
    rating: r.rating,
    title: r.title,
    body: r.body,
    isVerifiedPurchase: r.isVerifiedPurchase,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt?.toISOString() ?? null,
  }));
}
