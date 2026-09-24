/**
 * Promotion engine (§28, migration 0008) — ONE rules entity for what used to be
 * "offers" (banners) and "coupons" (codes). A promotion is automatic or unlocked by a
 * code; discounts a product / category / the cart (%, fixed, free delivery, free gift
 * above a threshold); may carry banner copy; is bounded by dates, a global usage limit
 * and a per-customer limit. Codes are validated SERVER-SIDE only (rate-limited at the
 * route). Every applied rule is recorded as a redemption with UNIQUE(promotion, order),
 * so nothing is ever applied twice to the same order.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Transaction } from '../../db/client';
import { db } from '../../db/client';
import { coupons, couponRedemptions, promotionProducts, promotionCategories } from '../../db/schema';
import { DEFAULT_STORE_ID } from '../../db/schema/system';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../lib/errors';
import { prefixedId } from '../../lib/ids';
import { Money } from '../../lib/money';
import { toLegacyDate } from '../../lib/clock';
import type { RequestContext } from '../../http/context';
import { logAudit } from '../audit';
import type { AppliedPromotion, PromotionScope, PromotionSpec, PromotionType } from '../pricing/engine';
import type { Offer, Promotion } from '../../types';

type Row = typeof coupons.$inferSelect;
type Targets = { productIds: string[]; categoryIds: string[] };

// ---- admin input ----

const isoDate = z.string().trim().max(40).optional();

export const promotionUpsertSchema = z
  .object({
    id: z.string().max(64).optional(),
    kind: z.enum(['automatic', 'code']).default('automatic'),
    code: z.string().trim().min(2).max(40).optional(),
    type: z.enum(['percentage', 'fixed', 'free_delivery', 'free_gift']),
    /** percentage: percent (15 = 15%); fixed: EGP; otherwise ignored. */
    value: z.number().min(0).max(1_000_000).default(0),
    maxDiscount: z.number().min(0).max(1_000_000).optional(),
    minOrder: z.number().min(0).max(1_000_000).default(0),
    scope: z.enum(['cart', 'category', 'product']).default('cart'),
    productIds: z.array(z.string().max(64)).max(200).default([]),
    categoryIds: z.array(z.string().max(64)).max(50).default([]),
    giftProductId: z.string().max(64).optional(),
    startsAt: isoDate,
    expiresAt: isoDate,
    isActive: z.boolean().default(true),
    usageLimit: z.number().int().min(1).max(1_000_000).optional(),
    perUserLimit: z.number().int().min(0).max(1000).optional(),
    showBanner: z.boolean().default(false),
    titleAr: z.string().trim().max(200).default(''),
    titleEn: z.string().trim().max(200).default(''),
    subtitleAr: z.string().max(300).default(''),
    subtitleEn: z.string().max(300).default(''),
    badgeAr: z.string().max(60).default(''),
    badgeEn: z.string().max(60).default(''),
    imageUrl: z.string().url().max(1000).optional(),
    theme: z.enum(['amber', 'gold', 'sunset']).default('gold'),
    sortOrder: z.number().int().min(0).max(10000).default(0),
    slug: z.string().trim().max(160).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.kind === 'code' && !v.code) ctx.addIssue({ code: 'custom', path: ['code'], message: 'A code promotion needs a code.' });
    if (v.type === 'free_gift' && !v.giftProductId) ctx.addIssue({ code: 'custom', path: ['giftProductId'], message: 'A free-gift promotion needs the gift product.' });
    if (v.scope === 'category' && v.categoryIds.length === 0) ctx.addIssue({ code: 'custom', path: ['categoryIds'], message: 'Pick at least one category.' });
    if (v.scope === 'product' && v.productIds.length === 0) ctx.addIssue({ code: 'custom', path: ['productIds'], message: 'Pick at least one product.' });
    if (v.type === 'percentage' && (v.value <= 0 || v.value > 100)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Percent must be 1–100.' });
    if (v.type === 'fixed' && v.value <= 0) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Amount must be positive.' });
  });

export type PromotionUpsertInput = z.infer<typeof promotionUpsertSchema>;

/** The banner-only shape the legacy offers admin (web + mobile) still sends. */
export const offerUpsertSchema = z
  .object({
    id: z.string().max(64).optional(),
    slug: z.string().trim().max(160).optional(),
    titleAr: z.string().trim().min(1).max(200),
    titleEn: z.string().trim().max(200).optional(),
    subtitleAr: z.string().max(300).optional(),
    subtitleEn: z.string().max(300).optional(),
    discountBadgeAr: z.string().max(60).optional(),
    discountBadgeEn: z.string().max(60).optional(),
    theme: z.enum(['amber', 'gold', 'sunset']).default('gold'),
    expiryDate: z.string().max(20).optional(),
    productId: z.string().max(64).optional(),
    categoryId: z.string().max(64).optional(),
  })
  .strict();

export type OfferUpsertInput = z.infer<typeof offerUpsertSchema>;

// ---- helpers ----

function slugify(str: string): string {
  return str.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '') || `promo-${Date.now()}`;
}

function parseDate(value: string | undefined, endOfDay: boolean): Date | null {
  if (!value) return null;
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = new Date(dayOnly ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : value);
  if (Number.isNaN(d.getTime())) {
    throw new BusinessRuleError({ code: 'INVALID_DATE', message: { ar: 'تاريخ غير صالح.', en: 'Invalid date.' }, meta: { value } });
  }
  return d;
}

function isLive(r: Row, now: Date): boolean {
  if (!r.isActive) return false;
  if (r.startsAt && r.startsAt > now) return false;
  if (r.expiresAt && r.expiresAt <= now) return false;
  if (r.usageLimit != null && r.usageCount >= r.usageLimit) return false;
  return true;
}

async function targetsFor(ids: string[]): Promise<Map<string, Targets>> {
  const map = new Map<string, Targets>();
  if (ids.length === 0) return map;
  const [ps, cs] = await Promise.all([
    db().select().from(promotionProducts).where(inArray(promotionProducts.couponId, ids)),
    db().select().from(promotionCategories).where(inArray(promotionCategories.couponId, ids)),
  ]);
  const get = (id: string) => map.get(id) ?? (map.set(id, { productIds: [], categoryIds: [] }), map.get(id)!);
  for (const p of ps) get(p.couponId).productIds.push(p.productId);
  for (const c of cs) get(c.couponId).categoryIds.push(c.categoryId);
  return map;
}

function toSpec(r: Row, t: Targets | undefined): PromotionSpec {
  return {
    id: r.id,
    code: r.code,
    kind: r.kind as PromotionSpec['kind'],
    type: r.type as PromotionType,
    value: r.value,
    maxDiscountMinor: r.maxDiscountMinor,
    minOrderMinor: r.minOrderMinor,
    scope: r.scope as PromotionScope,
    productIds: t?.productIds ?? [],
    categoryIds: t?.categoryIds ?? [],
    giftProductId: r.giftProductId,
    titleAr: r.titleAr || undefined,
    titleEn: r.titleEn || undefined,
  };
}

/** Banner badge: the admin's text, else derived from the rule so the copy can never contradict the discount. */
export function badgeFor(r: Pick<Row, 'badgeAr' | 'badgeEn' | 'type' | 'value'>): { ar: string; en: string } {
  if (r.badgeAr) return { ar: r.badgeAr, en: r.badgeEn || r.badgeAr };
  switch (r.type) {
    case 'percentage':
      return r.value > 0 ? { ar: `خصم ${r.value / 100}%`, en: `${r.value / 100}% OFF` } : { ar: '', en: '' };
    case 'fixed':
      return r.value > 0 ? { ar: `وفّر ${Money.ofMinor(r.value).toMajor()} ج.م`, en: `Save ${Money.ofMinor(r.value).toMajor()} EGP` } : { ar: '', en: '' };
    case 'free_delivery':
      return { ar: 'توصيل مجاني', en: 'Free delivery' };
    case 'free_gift':
      return { ar: 'هدية مجانية', en: 'Free gift' };
    default:
      return { ar: '', en: '' };
  }
}

function toPromotionDto(r: Row, t: Targets | undefined): Promotion {
  return {
    id: r.id,
    kind: r.kind as Promotion['kind'],
    code: r.code ?? undefined,
    type: r.type as PromotionType,
    value: r.type === 'percentage' ? r.value / 100 : r.type === 'fixed' ? Money.ofMinor(r.value).toMajor() : 0,
    maxDiscount: r.maxDiscountMinor != null ? Money.ofMinor(r.maxDiscountMinor).toMajor() : undefined,
    minOrder: Money.ofMinor(r.minOrderMinor).toMajor(),
    scope: r.scope as PromotionScope,
    productIds: t?.productIds ?? [],
    categoryIds: t?.categoryIds ?? [],
    giftProductId: r.giftProductId ?? undefined,
    startsAt: r.startsAt?.toISOString(),
    expiresAt: r.expiresAt?.toISOString(),
    isActive: r.isActive,
    usageLimit: r.usageLimit ?? undefined,
    perUserLimit: r.perUserLimit,
    usageCount: r.usageCount,
    showBanner: r.showBanner,
    titleAr: r.titleAr,
    titleEn: r.titleEn,
    subtitleAr: r.subtitleAr,
    subtitleEn: r.subtitleEn,
    badgeAr: r.badgeAr,
    badgeEn: r.badgeEn,
    displayBadgeAr: badgeFor(r).ar,
    displayBadgeEn: badgeFor(r).en,
    imageUrl: r.imageUrl ?? undefined,
    theme: r.theme as Promotion['theme'],
    sortOrder: r.sortOrder,
    slug: r.slug ?? undefined,
    createdAt: toLegacyDate(r.createdAt),
  };
}

function toOfferDto(r: Row, t: Targets | undefined): Offer {
  const badge = badgeFor(r);
  return {
    id: r.id,
    slug: r.slug ?? r.id,
    titleAr: r.titleAr,
    titleEn: r.titleEn,
    subtitleAr: r.subtitleAr,
    subtitleEn: r.subtitleEn,
    discountBadgeAr: badge.ar,
    discountBadgeEn: badge.en,
    theme: r.theme as Offer['theme'],
    expiryDate: r.expiresAt ? r.expiresAt.toISOString().slice(0, 10) : undefined,
    productId: t?.productIds[0],
    categoryId: t?.categoryIds[0],
    promotionId: r.id,
  };
}

// ---- engine inputs ----

/**
 * Automatic promotions in force right now for this shopper (per-customer limits are
 * honoured when signed in). Used by the cart, the quote and checkout — the same list, so
 * the discount the customer sees is the discount charged.
 */
export async function loadActivePromotions(opts: { userId?: string | null; now?: Date } = {}): Promise<PromotionSpec[]> {
  const now = opts.now ?? new Date();
  const rows = await db()
    .select()
    .from(coupons)
    .where(and(eq(coupons.storeId, DEFAULT_STORE_ID), eq(coupons.isActive, true), eq(coupons.kind, 'automatic')))
    .orderBy(coupons.sortOrder, coupons.createdAt);
  let live = rows.filter((r) => isLive(r, now));
  if (opts.userId && live.some((r) => r.perUserLimit > 0)) {
    const counts = await db()
      .select({ id: couponRedemptions.couponId, n: sql<number>`COUNT(*)::int` })
      .from(couponRedemptions)
      .where(and(eq(couponRedemptions.userId, opts.userId), inArray(couponRedemptions.couponId, live.map((r) => r.id))))
      .groupBy(couponRedemptions.couponId);
    const used = new Map(counts.map((c) => [c.id, c.n]));
    live = live.filter((r) => r.perUserLimit === 0 || (used.get(r.id) ?? 0) < r.perUserLimit);
  }
  const targets = await targetsFor(live.map((r) => r.id));
  return live.map((r) => toSpec(r, targets.get(r.id)));
}

export interface ValidatedCoupon extends PromotionSpec {
  id: string;
  code: string;
  minOrderMinor: number;
}

/**
 * Validate an entered code for a given user + subtotal. Returns the rule the pricing
 * engine applies, or throws a stable business error. Does NOT mutate — redemption
 * happens at order placement inside the checkout transaction.
 */
export async function validateCoupon(code: string, userId: string | null, subtotalMinor: number): Promise<ValidatedCoupon> {
  const normalized = code.trim().toUpperCase();
  const [row] = await db()
    .select()
    .from(coupons)
    .where(and(eq(coupons.storeId, DEFAULT_STORE_ID), sql`UPPER(${coupons.code}) = ${normalized}`))
    .limit(1);

  const invalid = new NotFoundError({ code: 'COUPON_INVALID', message: { ar: 'الكوبون غير صالح.', en: 'This coupon is not valid.' } });
  if (!row || !row.isActive || !row.code) throw invalid;

  const now = new Date();
  if (row.startsAt && row.startsAt > now) throw invalid;
  if (row.expiresAt && row.expiresAt <= now) {
    throw new BusinessRuleError({ code: 'COUPON_EXPIRED', message: { ar: 'انتهت صلاحية الكوبون.', en: 'This coupon has expired.' } });
  }
  if (row.usageLimit != null && row.usageCount >= row.usageLimit) {
    throw new BusinessRuleError({ code: 'COUPON_EXHAUSTED', message: { ar: 'تم استنفاد هذا الكوبون.', en: 'This coupon has been fully used.' } });
  }
  if (subtotalMinor < row.minOrderMinor) {
    throw new BusinessRuleError({
      code: 'COUPON_MIN_ORDER',
      message: { ar: 'قيمة الطلب أقل من الحد الأدنى للكوبون.', en: 'Order total is below the coupon minimum.' },
      meta: { minOrderMinor: String(row.minOrderMinor) },
    });
  }
  if (userId && row.perUserLimit > 0) {
    const [{ count }] = await db()
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(couponRedemptions)
      .where(and(eq(couponRedemptions.couponId, row.id), eq(couponRedemptions.userId, userId)));
    if (count >= row.perUserLimit) {
      throw new BusinessRuleError({ code: 'COUPON_PER_USER_LIMIT', message: { ar: 'لقد استخدمت هذا الكوبون من قبل.', en: 'You have already used this coupon.' } });
    }
  }
  const targets = await targetsFor([row.id]);
  return { ...toSpec(row, targets.get(row.id)), id: row.id, code: row.code, minOrderMinor: row.minOrderMinor };
}

/**
 * Record every applied rule inside the checkout transaction. UNIQUE(promotion, order)
 * makes this idempotent per order; usage_count is incremented atomically.
 */
export async function redeemPromotions(tx: Transaction, applied: AppliedPromotion[], userId: string | null, orderId: string): Promise<void> {
  for (const a of applied) {
    if (a.id.startsWith('code:')) continue; // synthetic legacy spec, nothing to record
    const inserted = await tx.insert(couponRedemptions).values({ couponId: a.id, userId, orderId, discountMinor: a.discountMinor }).onConflictDoNothing().returning({ id: couponRedemptions.id });
    if (inserted.length === 0) continue;
    // The usage limit is re-checked HERE, atomically: two checkouts racing for the last
    // use both passed the read-time filter, but only one can take the counter past the
    // guard — the other rolls back and the customer sees the rule was used up.
    const taken = await tx
      .update(coupons)
      .set({ usageCount: sql`${coupons.usageCount} + 1` })
      .where(and(eq(coupons.id, a.id), sql`(${coupons.usageLimit} IS NULL OR ${coupons.usageCount} < ${coupons.usageLimit})`))
      .returning({ id: coupons.id });
    if (taken.length === 0) {
      throw new BusinessRuleError({ code: 'COUPON_EXHAUSTED', message: { ar: 'تم استنفاد هذا العرض قبل إتمام طلبك. أعد المحاولة.', en: 'This promotion was used up before your order completed. Please try again.' }, meta: { promotionId: a.id } });
    }
  }
}

/** @deprecated single-code redemption kept for callers that predate the engine. */
export async function redeemCoupon(tx: Transaction, couponId: string, userId: string | null, orderId: string, discountMinor: number): Promise<void> {
  await redeemPromotions(tx, [{ id: couponId, type: 'fixed', discountMinor, freeDelivery: false }], userId, orderId);
}

// ---- admin ----

export async function listPromotionsAdmin(): Promise<Promotion[]> {
  const rows = await db().select().from(coupons).where(eq(coupons.storeId, DEFAULT_STORE_ID)).orderBy(coupons.sortOrder, coupons.createdAt);
  const targets = await targetsFor(rows.map((r) => r.id));
  return rows.map((r) => toPromotionDto(r, targets.get(r.id)));
}

export async function getPromotion(id: string): Promise<Promotion> {
  const [row] = await db().select().from(coupons).where(eq(coupons.id, id)).limit(1);
  if (!row) throw new NotFoundError({ code: 'PROMOTION_NOT_FOUND', message: { ar: 'العرض غير موجود.', en: 'Promotion not found.' } });
  const targets = await targetsFor([id]);
  return toPromotionDto(row, targets.get(id));
}

export async function savePromotion(ctx: RequestContext, input: PromotionUpsertInput): Promise<Promotion> {
  const id = input.id ?? prefixedId('promo');
  const code = input.kind === 'code' ? input.code!.trim().toUpperCase() : null;
  if (code) {
    const [clash] = await db().select({ id: coupons.id }).from(coupons).where(and(eq(coupons.storeId, DEFAULT_STORE_ID), sql`UPPER(${coupons.code}) = ${code}`, sql`${coupons.id} <> ${id}`)).limit(1);
    if (clash) throw new ConflictError({ code: 'PROMOTION_CODE_TAKEN', message: { ar: 'هذا الكود مستخدم في عرض آخر.', en: 'This code is already used by another promotion.' } });
  }
  const values = {
    code,
    kind: input.kind,
    type: input.type,
    value: input.type === 'percentage' ? Math.round(input.value * 100) : input.type === 'fixed' ? Money.ofMajor(input.value).minor : 0,
    scope: input.scope,
    giftProductId: input.type === 'free_gift' ? (input.giftProductId ?? null) : null,
    minOrderMinor: Money.ofMajor(input.minOrder).minor,
    maxDiscountMinor: input.maxDiscount != null ? Money.ofMajor(input.maxDiscount).minor : null,
    usageLimit: input.usageLimit ?? null,
    perUserLimit: input.perUserLimit ?? (input.kind === 'code' ? 1 : 0),
    startsAt: parseDate(input.startsAt, false),
    expiresAt: parseDate(input.expiresAt, true),
    isActive: input.isActive,
    showBanner: input.showBanner,
    titleAr: input.titleAr,
    titleEn: input.titleEn,
    subtitleAr: input.subtitleAr,
    subtitleEn: input.subtitleEn,
    badgeAr: input.badgeAr,
    badgeEn: input.badgeEn,
    imageUrl: input.imageUrl ?? null,
    theme: input.theme,
    sortOrder: input.sortOrder,
    slug: input.slug || (input.showBanner ? slugify(input.titleEn || input.titleAr || id) : null),
  };
  await db().transaction(async (tx) => {
    if (input.id) {
      const [existing] = await tx.select({ id: coupons.id }).from(coupons).where(eq(coupons.id, id)).limit(1);
      if (!existing) throw new NotFoundError({ code: 'PROMOTION_NOT_FOUND', message: { ar: 'العرض غير موجود.', en: 'Promotion not found.' } });
      await tx.update(coupons).set(values).where(eq(coupons.id, id));
    } else {
      await tx.insert(coupons).values({ id, storeId: DEFAULT_STORE_ID, ...values });
    }
    await tx.delete(promotionProducts).where(eq(promotionProducts.couponId, id));
    await tx.delete(promotionCategories).where(eq(promotionCategories.couponId, id));
    for (const productId of new Set(input.productIds)) await tx.insert(promotionProducts).values({ couponId: id, productId }).onConflictDoNothing();
    for (const categoryId of new Set(input.categoryIds)) await tx.insert(promotionCategories).values({ couponId: id, categoryId }).onConflictDoNothing();
  });
  await logAudit({
    actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff',
    action: 'promotion_updated', resource: 'promotions', resourceId: id, target: input.titleAr || code || id,
    metadata: { kind: input.kind, type: input.type, scope: input.scope }, requestId: ctx.requestId,
  });
  return getPromotion(id);
}

/** Delete when never used; otherwise deactivate — redemptions are financial history. */
export async function deletePromotion(ctx: RequestContext, id: string): Promise<{ deleted: boolean }> {
  const [row] = await db().select().from(coupons).where(eq(coupons.id, id)).limit(1);
  if (!row) throw new NotFoundError({ code: 'PROMOTION_NOT_FOUND', message: { ar: 'العرض غير موجود.', en: 'Promotion not found.' } });
  const [{ count }] = await db().select({ count: sql<number>`COUNT(*)::int` }).from(couponRedemptions).where(eq(couponRedemptions.couponId, id));
  if (count > 0) await db().update(coupons).set({ isActive: false, showBanner: false }).where(eq(coupons.id, id));
  else await db().delete(coupons).where(eq(coupons.id, id));
  await logAudit({
    actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff',
    action: 'promotion_updated', resource: 'promotions', resourceId: id, target: row.titleAr || row.code || id,
    metadata: { action: count > 0 ? 'deactivated' : 'deleted' }, requestId: ctx.requestId,
  });
  return { deleted: count === 0 };
}

// ---- banners (the former "offers" surface; a façade over the same rows) ----

export async function listActiveBanners(): Promise<Offer[]> {
  const now = new Date();
  const rows = await db()
    .select()
    .from(coupons)
    .where(and(eq(coupons.storeId, DEFAULT_STORE_ID), eq(coupons.showBanner, true), eq(coupons.isActive, true)))
    .orderBy(coupons.sortOrder, coupons.createdAt);
  const live = rows.filter((r) => isLive(r, now));
  const targets = await targetsFor(live.map((r) => r.id));
  return live.map((r) => toOfferDto(r, targets.get(r.id)));
}

export async function listAllBanners(): Promise<Offer[]> {
  const rows = await db().select().from(coupons).where(and(eq(coupons.storeId, DEFAULT_STORE_ID), eq(coupons.showBanner, true))).orderBy(coupons.sortOrder, coupons.createdAt);
  const targets = await targetsFor(rows.map((r) => r.id));
  return rows.map((r) => toOfferDto(r, targets.get(r.id)));
}

/** Legacy offers admin: creates/updates the BANNER side of a promotion, leaving any rule intact. */
export async function saveBanner(ctx: RequestContext, input: OfferUpsertInput): Promise<Offer> {
  const existing = input.id ? await getPromotion(input.id) : null;
  const scope: PromotionScope = input.productId ? 'product' : input.categoryId ? 'category' : (existing?.scope ?? 'cart');
  const saved = await savePromotion(ctx, {
    id: existing?.id,
    kind: existing?.kind ?? 'automatic',
    code: existing?.code,
    type: existing?.type ?? 'percentage',
    value: existing?.value ?? 0,
    maxDiscount: existing?.maxDiscount,
    minOrder: existing?.minOrder ?? 0,
    scope,
    productIds: input.productId ? [input.productId] : scope === 'product' ? (existing?.productIds ?? []) : [],
    categoryIds: input.categoryId ? [input.categoryId] : scope === 'category' ? (existing?.categoryIds ?? []) : [],
    giftProductId: existing?.giftProductId,
    startsAt: existing?.startsAt,
    expiresAt: input.expiryDate ?? existing?.expiresAt,
    isActive: existing?.isActive ?? true,
    usageLimit: existing?.usageLimit,
    perUserLimit: existing?.perUserLimit ?? 0,
    showBanner: true,
    titleAr: input.titleAr,
    titleEn: input.titleEn ?? '',
    subtitleAr: input.subtitleAr ?? '',
    subtitleEn: input.subtitleEn ?? '',
    badgeAr: input.discountBadgeAr ?? '',
    badgeEn: input.discountBadgeEn ?? '',
    imageUrl: existing?.imageUrl,
    theme: input.theme,
    sortOrder: existing?.sortOrder ?? 0,
    slug: input.slug ?? existing?.slug,
  });
  const targets = await targetsFor([saved.id]);
  const [row] = await db().select().from(coupons).where(eq(coupons.id, saved.id)).limit(1);
  return toOfferDto(row!, targets.get(saved.id));
}

export async function deleteBanner(ctx: RequestContext, id: string): Promise<void> {
  await deletePromotion(ctx, id);
}
