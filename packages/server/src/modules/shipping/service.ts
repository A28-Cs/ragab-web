/**
 * Delivery zones (§21, AC-14) — the single pricing source for delivery. An address points
 * at a zone; the cart, the quote and checkout all charge THAT zone's fee and enforce its
 * minimum order, so the number the customer sees on the home page is the number charged.
 * Staff manage zones here without a deploy. Soft delete: a zone that addresses/orders
 * already reference is hidden from pickers, never destroyed.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client';
import { addresses, deliveryZones } from '../../db/schema';
import { DEFAULT_STORE_ID } from '../../db/schema/system';
import { BusinessRuleError, NotFoundError } from '../../lib/errors';
import { prefixedId } from '../../lib/ids';
import { Money } from '../../lib/money';
import type { RequestContext } from '../../http/context';
import { logAudit } from '../audit';
import type { DeliveryZone } from '../../types';
import type { DeliveryZonePatchInput, DeliveryZoneUpsertInput } from './schema';

export type ZoneRow = typeof deliveryZones.$inferSelect;

function toDto(r: ZoneRow): DeliveryZone {
  return {
    id: r.id,
    nameAr: r.nameAr,
    nameEn: r.nameEn,
    deliveryFee: Money.ofMinor(r.deliveryFeeMinor).toMajor(),
    estimatedTimeAr: r.estimatedTimeAr,
    estimatedTimeEn: r.estimatedTimeEn,
    minOrder: Money.ofMinor(r.minOrderMinor).toMajor(),
    isActive: r.isActive,
    sortOrder: r.sortOrder,
  };
}

const notDeleted = () => and(eq(deliveryZones.storeId, DEFAULT_STORE_ID), isNull(deliveryZones.deletedAt));
const zoneOrder = [asc(deliveryZones.sortOrder), asc(deliveryZones.deliveryFeeMinor), asc(deliveryZones.nameAr)];

/** Public picker: active zones only. */
export async function listDeliveryZones(): Promise<DeliveryZone[]> {
  const rows = await db().select().from(deliveryZones).where(and(notDeleted(), eq(deliveryZones.isActive, true))).orderBy(...zoneOrder);
  return rows.map(toDto);
}

/** Admin view: every zone that has not been deleted, inactive ones included. */
export async function listZonesAdmin(): Promise<DeliveryZone[]> {
  const rows = await db().select().from(deliveryZones).where(notDeleted()).orderBy(...zoneOrder);
  return rows.map(toDto);
}

export async function getZoneRow(id: string): Promise<ZoneRow | null> {
  const [row] = await db().select().from(deliveryZones).where(and(eq(deliveryZones.id, id), isNull(deliveryZones.deletedAt))).limit(1);
  return row ?? null;
}

/** "قرية عليم", "عليم" and "Elim" all name the same zone. */
export function normaliseVillage(name: string): string {
  return name.trim().replace(/^(قرية|مدينة|مركز|كفر)\s+/u, '').toLowerCase();
}

export async function findZoneByName(name: string): Promise<ZoneRow | null> {
  const key = normaliseVillage(name);
  if (!key) return null;
  const rows = await db().select().from(deliveryZones).where(notDeleted());
  return rows.find((r) => normaliseVillage(r.nameAr) === key || r.nameEn.trim().toLowerCase() === key) ?? null;
}

/** The zone an address resolves to: its explicit zone, else a name match, else none. */
export async function resolveZone(address: { zoneId?: string | null; village?: string | null }): Promise<ZoneRow | null> {
  if (address.zoneId) {
    const z = await getZoneRow(address.zoneId);
    if (z) return z;
  }
  return address.village ? findZoneByName(address.village) : null;
}

/**
 * Checkout-time truth. An address pinned to a zone that is no longer served cannot be
 * delivered to — say so, rather than silently charging the store default. A legacy
 * free-text village with no zone at all falls back to the store default fee (`null`).
 */
export async function requireDeliverableZone(address: { zoneId?: string | null; village?: string | null }): Promise<ZoneRow | null> {
  if (address.zoneId) {
    const [z] = await db().select().from(deliveryZones).where(eq(deliveryZones.id, address.zoneId)).limit(1);
    if (!z || z.deletedAt || !z.isActive) {
      throw new BusinessRuleError({
        code: 'ZONE_UNAVAILABLE',
        message: { ar: 'منطقة التوصيل لهذا العنوان لم تعد متاحة. اختر عنوانًا آخر.', en: 'The delivery zone of this address is no longer served. Please choose another address.' },
        meta: { zoneId: address.zoneId },
      });
    }
    return z;
  }
  const byName = address.village ? await findZoneByName(address.village) : null;
  return byName && byName.isActive ? byName : null;
}

/** The zone of a customer's default (else first) address — what the cart shows as the fee. */
export async function defaultZoneForUser(userId: string): Promise<ZoneRow | null> {
  const rows = await db().select().from(addresses).where(eq(addresses.userId, userId)).orderBy(asc(addresses.isDefault), asc(addresses.createdAt));
  const addr = rows.find((a) => a.isDefault) ?? rows[0];
  if (!addr) return null;
  const zone = await resolveZone(addr);
  return zone && zone.isActive ? zone : null;
}

// ---- admin CRUD ----

export async function createZone(ctx: RequestContext, input: DeliveryZoneUpsertInput): Promise<DeliveryZone> {
  const id = prefixedId('zone');
  await db().insert(deliveryZones).values({
    id,
    storeId: DEFAULT_STORE_ID,
    nameAr: input.nameAr,
    nameEn: input.nameEn,
    deliveryFeeMinor: Money.ofMajor(input.deliveryFee).minor,
    minOrderMinor: Money.ofMajor(input.minOrder).minor,
    estimatedTimeAr: input.estimatedTimeAr,
    estimatedTimeEn: input.estimatedTimeEn,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  });
  await logAudit({
    actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff',
    action: 'settings_updated', resource: 'settings', resourceId: id, target: input.nameAr,
    metadata: { op: 'zone_created', deliveryFee: String(input.deliveryFee) }, requestId: ctx.requestId,
  });
  return toDto((await getZoneRow(id))!);
}

export async function updateZone(ctx: RequestContext, id: string, patch: DeliveryZonePatchInput): Promise<DeliveryZone> {
  const existing = await getZoneRow(id);
  if (!existing) throw new NotFoundError({ code: 'ZONE_NOT_FOUND', message: { ar: 'منطقة التوصيل غير موجودة.', en: 'Delivery zone not found.' } });
  const set: Partial<typeof deliveryZones.$inferInsert> = {};
  if (patch.nameAr !== undefined) set.nameAr = patch.nameAr;
  if (patch.nameEn !== undefined) set.nameEn = patch.nameEn;
  if (patch.deliveryFee !== undefined) set.deliveryFeeMinor = Money.ofMajor(patch.deliveryFee).minor;
  if (patch.minOrder !== undefined) set.minOrderMinor = Money.ofMajor(patch.minOrder).minor;
  if (patch.estimatedTimeAr !== undefined) set.estimatedTimeAr = patch.estimatedTimeAr;
  if (patch.estimatedTimeEn !== undefined) set.estimatedTimeEn = patch.estimatedTimeEn;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
  if (Object.keys(set).length > 0) await db().update(deliveryZones).set(set).where(eq(deliveryZones.id, id));
  await logAudit({
    actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff',
    action: 'settings_updated', resource: 'settings', resourceId: id, target: patch.nameAr ?? existing.nameAr,
    metadata: { op: 'zone_updated', fields: Object.keys(set).join(',') }, requestId: ctx.requestId,
  });
  return toDto((await getZoneRow(id))!);
}

/** Soft delete: gone from every picker; addresses keep the reference and checkout refuses them clearly. */
export async function deleteZone(ctx: RequestContext, id: string): Promise<void> {
  const existing = await getZoneRow(id);
  if (!existing) throw new NotFoundError({ code: 'ZONE_NOT_FOUND', message: { ar: 'منطقة التوصيل غير موجودة.', en: 'Delivery zone not found.' } });
  await db().update(deliveryZones).set({ deletedAt: new Date(), isActive: false }).where(eq(deliveryZones.id, id));
  await logAudit({
    actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff',
    action: 'settings_updated', resource: 'settings', resourceId: id, target: existing.nameAr,
    metadata: { op: 'zone_deleted' }, requestId: ctx.requestId,
  });
}
