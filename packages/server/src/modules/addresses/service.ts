/**
 * Addresses (§30). Customer-owned; every operation is scoped to the caller (§11) so a
 * user can only read/edit/delete their OWN addresses. Setting one default clears the
 * others in the same transaction.
 */
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client';
import { addresses } from '../../db/schema';
import { AuthenticationError, NotFoundError } from '../../lib/errors';
import { prefixedId } from '../../lib/ids';
import type { RequestContext } from '../../http/context';
import { BusinessRuleError } from '../../lib/errors';
import { resolveZone } from '../shipping/service';
import type { Address } from '../../types';

export const addressSchema = z.object({
  title: z.string().trim().min(1).max(120),
  label: z.enum(['home', 'work', 'other']).optional(),
  recipientName: z.string().trim().min(1).max(120),
  phone: z.string().trim().regex(/^01[0125]\d{8}$/),
  village: z.string().trim().min(1).max(120),
  /** Explicit delivery zone; when absent the village name is matched against the zones. */
  zoneId: z.string().trim().min(1).max(64).optional(),
  streetAddress: z.string().trim().min(1).max(300),
  landmark: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  googleMapsUrl: z.string().max(1000).optional(),
  mapUrl: z.string().max(1000).optional(),
  isDefault: z.boolean().optional(),
}).strict();

export type AddressInput = z.infer<typeof addressSchema>;

function prepareAddressRow(input: AddressInput) {
  const mapLink = input.googleMapsUrl || input.mapUrl;
  let notes = input.notes || '';
  if (mapLink && !notes.includes(`[MAP:${mapLink}]`)) {
    notes = notes ? `${notes} [MAP:${mapLink}]` : `[MAP:${mapLink}]`;
  }
  const { googleMapsUrl: _g, mapUrl: _m, ...rowFields } = input;
  return {
    ...rowFields,
    notes: notes || undefined,
  };
}

function toDto(row: typeof addresses.$inferSelect): Address {
  const mapUrl = (row.notes?.match(/\[MAP:(https?:\/\/[^\]]+)\]/)?.[1])
    || (row.notes?.match(/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.com|www\.google\.com\/maps)[^\s]+/)?.[0])
    || undefined;

  const cleanNotes = row.notes?.replace(/\s*\[MAP:[^\]]+\]\s*/g, '').trim() || undefined;

  return {
    id: row.id,
    title: row.title,
    label: (row.label as Address['label']) ?? undefined,
    recipientName: row.recipientName,
    phone: row.phone,
    village: row.village,
    streetAddress: row.streetAddress,
    landmark: row.landmark ?? undefined,
    notes: cleanNotes,
    googleMapsUrl: mapUrl,
    mapUrl: mapUrl,
    isDefault: row.isDefault,
    zoneId: row.zoneId ?? undefined,
  };
}

/**
 * Pin the address to its zone (AC-14): an explicit `zoneId` must exist; otherwise the
 * village name is matched. A name that matches nothing is kept as free text (legacy) and
 * checkout falls back to the store default fee for it.
 */
async function zoneIdFor(input: AddressInput): Promise<string | null> {
  const zone = await resolveZone({ zoneId: input.zoneId, village: input.village });
  if (input.zoneId && !zone) {
    throw new BusinessRuleError({ code: 'ZONE_NOT_FOUND', message: { ar: 'منطقة التوصيل غير موجودة.', en: 'Delivery zone not found.' }, meta: { zoneId: input.zoneId } });
  }
  return zone?.id ?? null;
}

function requireUser(ctx: RequestContext): string {
  if (!ctx.principal) throw new AuthenticationError({ message: { ar: 'يجب تسجيل الدخول.', en: 'Authentication required.' } });
  return ctx.principal.userId;
}

export async function listAddresses(ctx: RequestContext): Promise<Address[]> {
  const userId = requireUser(ctx);
  const rows = await db().select().from(addresses).where(eq(addresses.userId, userId)).orderBy(sql`${addresses.isDefault} DESC`, addresses.createdAt);
  return rows.map(toDto);
}

export async function createAddress(ctx: RequestContext, input: AddressInput): Promise<Address> {
  const userId = requireUser(ctx);
  const zoneId = await zoneIdFor(input);
  const rowData = prepareAddressRow(input);
  return db().transaction(async (tx) => {
    if (input.isDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));
    const id = prefixedId('addr');
    await tx.insert(addresses).values({ id, userId, ...rowData, zoneId });
    const [row] = await tx.select().from(addresses).where(eq(addresses.id, id)).limit(1);
    return toDto(row!);
  });
}

export async function updateAddress(ctx: RequestContext, id: string, input: AddressInput): Promise<Address> {
  const userId = requireUser(ctx);
  const rowData = prepareAddressRow(input);
  return db().transaction(async (tx) => {
    const [existing] = await tx.select().from(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, userId))).limit(1);
    if (!existing) throw new NotFoundError({ code: 'ADDRESS_NOT_FOUND', message: { ar: 'العنوان غير موجود.', en: 'Address not found.' } });
    if (input.isDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));
    const zoneId = await zoneIdFor(input);
    await tx.update(addresses).set({ ...rowData, zoneId }).where(eq(addresses.id, id));
    const [row] = await tx.select().from(addresses).where(eq(addresses.id, id)).limit(1);
    return toDto(row!);
  });
}

export async function deleteAddress(ctx: RequestContext, id: string): Promise<void> {
  const userId = requireUser(ctx);
  const res = await db().delete(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, userId))).returning({ id: addresses.id });
  if (res.length === 0) throw new NotFoundError({ code: 'ADDRESS_NOT_FOUND', message: { ar: 'العنوان غير موجود.', en: 'Address not found.' } });
}
