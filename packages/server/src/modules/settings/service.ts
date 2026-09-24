/**
 * Store settings service (§24 caching). Reads the single store_settings row — the
 * ONE source of truth for the delivery rule the prototype duplicated four times.
 * Cached in-process with a short TTL and invalidated on write. This is the value the
 * cart, checkout and quote all read, so pricing can never disagree with itself.
 */
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { storeSettings, taxSettings } from '../../db/schema';
import { DEFAULT_STORE_ID } from '../../db/schema/system';
import { NotFoundError } from '../../lib/errors';

export interface ResolvedSettings {
  deliveryFeeMinor: number;
  freeDeliveryThresholdMinor: number;
  codEnabled: boolean;
  onlinePaymentsEnabled: boolean;
  maintenanceMode: boolean;
  storeNameAr: string;
  storeNameEn: string;
  phone: string;
  whatsapp: string;
  workingHours: string;
  tax: { rateBps: number; inclusive: boolean; enabled: boolean } | null;
}

let cache: { value: ResolvedSettings; at: number } | null = null;
const TTL_MS = 30_000;

export async function getSettings(force = false): Promise<ResolvedSettings> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const [row] = await db().select().from(storeSettings).where(eq(storeSettings.id, DEFAULT_STORE_ID)).limit(1);
  if (!row) throw new NotFoundError({ code: 'SETTINGS_NOT_FOUND', message: { ar: 'الإعدادات غير موجودة.', en: 'Store settings not found.' } });
  const [tax] = await db().select().from(taxSettings).where(eq(taxSettings.enabled, true)).limit(1);
  const value: ResolvedSettings = {
    deliveryFeeMinor: row.deliveryFeeMinor,
    freeDeliveryThresholdMinor: row.freeDeliveryThresholdMinor,
    codEnabled: row.codEnabled,
    onlinePaymentsEnabled: row.onlinePaymentsEnabled,
    maintenanceMode: row.maintenanceMode,
    storeNameAr: row.storeNameAr,
    storeNameEn: row.storeNameEn,
    phone: row.phone,
    whatsapp: row.whatsapp,
    workingHours: row.workingHours,
    tax: tax ? { rateBps: tax.rateBps, inclusive: tax.inclusive, enabled: tax.enabled } : null,
  };
  cache = { value, at: Date.now() };
  return value;
}

export function invalidateSettingsCache(): void {
  cache = null;
}

// ---- Admin: read/update store settings ----
import { z } from 'zod';
import { Money } from '../../lib/money';
import type { RequestContext } from '../../http/context';
import { logAudit } from '../audit';
import type { StoreSettings } from '../../types';

export const settingsUpdateSchema = z.object({
  storeNameAr: z.string().min(1).max(120).optional(),
  storeNameEn: z.string().min(1).max(120).optional(),
  phone: z.string().max(40).optional(),
  whatsapp: z.string().max(40).optional(),
  addressAr: z.string().max(300).optional(),
  deliveryFee: z.number().min(0).max(100000).optional(),
  freeDeliveryThreshold: z.number().min(0).max(1000000).optional(),
  workingHours: z.string().max(200).optional(),
  codEnabled: z.boolean().optional(),
  onlinePaymentsEnabled: z.boolean().optional(),
  maintenanceMode: z.boolean().optional(),
}).strict();

export async function getStoreSettings(): Promise<StoreSettings> {
  const [row] = await db().select().from(storeSettings).where(eq(storeSettings.id, DEFAULT_STORE_ID)).limit(1);
  if (!row) throw new NotFoundError({ code: 'SETTINGS_NOT_FOUND', message: { ar: 'الإعدادات غير موجودة.', en: 'Store settings not found.' } });
  return {
    storeNameAr: row.storeNameAr, storeNameEn: row.storeNameEn, phone: row.phone, whatsapp: row.whatsapp,
    addressAr: row.addressAr, deliveryFee: Money.ofMinor(row.deliveryFeeMinor).toMajor(),
    freeDeliveryThreshold: Money.ofMinor(row.freeDeliveryThresholdMinor).toMajor(),
    workingHours: row.workingHours, codEnabled: row.codEnabled, onlinePaymentsEnabled: row.onlinePaymentsEnabled, maintenanceMode: row.maintenanceMode,
  };
}

export async function updateStoreSettings(ctx: RequestContext, input: z.infer<typeof settingsUpdateSchema>): Promise<StoreSettings> {
  const patch: Record<string, unknown> = {};
  if (input.storeNameAr !== undefined) patch.storeNameAr = input.storeNameAr;
  if (input.storeNameEn !== undefined) patch.storeNameEn = input.storeNameEn;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.whatsapp !== undefined) patch.whatsapp = input.whatsapp;
  if (input.addressAr !== undefined) patch.addressAr = input.addressAr;
  if (input.deliveryFee !== undefined) patch.deliveryFeeMinor = Money.ofMajor(input.deliveryFee).minor;
  if (input.freeDeliveryThreshold !== undefined) patch.freeDeliveryThresholdMinor = Money.ofMajor(input.freeDeliveryThreshold).minor;
  if (input.workingHours !== undefined) patch.workingHours = input.workingHours;
  if (input.codEnabled !== undefined) patch.codEnabled = input.codEnabled;
  if (input.onlinePaymentsEnabled !== undefined) patch.onlinePaymentsEnabled = input.onlinePaymentsEnabled;
  if (input.maintenanceMode !== undefined) patch.maintenanceMode = input.maintenanceMode;
  await db().update(storeSettings).set(patch).where(eq(storeSettings.id, DEFAULT_STORE_ID));
  invalidateSettingsCache();
  await logAudit({ actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff', action: 'settings_changed', resource: 'settings', metadata: { keys: Object.keys(patch).join(',') }, requestId: ctx.requestId });
  return getStoreSettings();
}
