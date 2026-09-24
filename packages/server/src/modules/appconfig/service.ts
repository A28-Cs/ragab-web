/**
 * App config (§47, §48). A cheap, public, unauthenticated snapshot the mobile app fetches
 * on launch: the minimum supported version (drives soft/forced update prompts), the
 * current store operating state (maintenance, which payment methods are live), the shared
 * store/delivery facts, and coarse feature flags. All business truth still comes from the
 * dedicated endpoints — this is only for bootstrapping and the update gate.
 */
import { Money } from '../../lib/money';
import { serverEnv } from '../../config/env';
import { getSettings } from '../settings/service';

export interface AppConfig {
  minimumSupportedVersion: string;
  latestVersion: string;
  forceUpdate: boolean;
  maintenanceMode: boolean;
  payments: { cod: boolean; onlinePayments: boolean };
  store: {
    nameAr: string;
    nameEn: string;
    phone: string;
    whatsapp: string;
    workingHours: string;
    deliveryFee: number;
    freeDeliveryThreshold: number;
    currency: string;
  };
  featureFlags: { wishlist: boolean; push: boolean };
}

export async function getAppConfig(): Promise<AppConfig> {
  const env = serverEnv();
  const s = await getSettings();
  return {
    minimumSupportedVersion: env.MOBILE_MIN_SUPPORTED_VERSION,
    latestVersion: env.MOBILE_LATEST_VERSION,
    forceUpdate: env.MOBILE_FORCE_UPDATE,
    maintenanceMode: s.maintenanceMode,
    payments: { cod: s.codEnabled, onlinePayments: s.onlinePaymentsEnabled },
    store: {
      nameAr: s.storeNameAr,
      nameEn: s.storeNameEn,
      phone: s.phone,
      whatsapp: s.whatsapp,
      workingHours: s.workingHours,
      deliveryFee: Money.ofMinor(s.deliveryFeeMinor).toMajor(),
      freeDeliveryThreshold: Money.ofMinor(s.freeDeliveryThresholdMinor).toMajor(),
      currency: 'EGP',
    },
    featureFlags: { wishlist: true, push: true },
  };
}
