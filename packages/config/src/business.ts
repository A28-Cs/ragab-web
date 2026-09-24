import { BusinessConfig } from '@ragab/types';

export const RAGAB_BUSINESS_CONFIG: BusinessConfig = {
  nameAr: 'رجب',
  nameEn: 'Ragab Pharmacy',
  sloganAr: 'صحتك أمانة في أيدينا',
  sloganEn: 'Your Health, Our Trust',
  locationAr: 'عليم – أبو حماد – الشرقية',
  locationFullAr: 'قرية عليم – مركز أبو حماد – محافظة الشرقية – مصر',
  defaultCurrencyAr: 'ج.م',
  defaultCurrencyEn: 'EGP',
  contactPhone: process.env.NEXT_PUBLIC_STORE_PHONE || '+20 10 1234 5678',
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '+201012345678',
  workingHoursAr: 'يومياً من 8 صباحاً حتى 12 منتصف الليل',
  freeDeliveryThreshold: 300,
  standardDeliveryFee: 15,
  supportedVillages: [
    'قرية عليم (المقر الرئيسي)',
    'كفر العزازي',
    'قرية الخيس',
    'بني أيوب والقرى المجاورة',
    'مدينة أبو حماد',
  ],
};

export const API_CONFIG = {
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.ragab-pharmacy.com/v1',
  timeoutMs: 10000,
  useMockAdapter: true,
};
