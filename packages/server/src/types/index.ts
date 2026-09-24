/**
 * API contract types (DTOs). These mirror apps/web/src/types/index.ts EXACTLY so the
 * existing frontend services keep their shapes (§ contract decision). Mappers project
 * normalized DB rows into these. RBAC types are re-exported from the permission catalog
 * so client and server share one definition.
 */
export type {
  Resource,
  Action,
  PermissionKey,
  ResourceMeta,
} from '../security/permissions';

export type Language = 'ar' | 'en';

export interface Category {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  iconName: string;
  itemCount: number;
  featured?: boolean;
  image?: string;
  colorTheme?: 'brand' | 'green' | 'blue' | 'rose' | 'violet' | 'orange';
  descriptionAr?: string;
  descriptionEn?: string;
  /** Parent category id — present only on a subcategory (e.g. "مياه" under "المشروبات"). */
  parentId?: string;
}

export interface Product {
  id: string;
  slug: string;
  nameAr: string;
  nameEn?: string;
  categoryId: string;
  categoryNameAr: string;
  categoryNameEn?: string;
  brandAr?: string;
  brandEn?: string;
  unitAr: string;
  unitEn: string;
  price: number;
  oldPrice?: number;
  discountPercentage?: number;
  inStock: boolean;
  stockQuantity: number;
  image: string;
  badgeAr?: string;
  badgeEn?: string;
  isPopular?: boolean;
  isEssential?: boolean;
  descriptionAr: string;
  descriptionEn?: string;
  nutritionFactsAr?: string[];
  originAr?: string;
  images?: string[];
  rating?: number;
  reviewCount?: number;
  unitValue?: number;
  unitMeasure?: 'L' | 'ml' | 'kg' | 'g' | 'pc';
  lowStockThreshold?: number;
  tags?: string[];
  isNew?: boolean;
  /** Additive: true ISO timestamp alongside the legacy fields. */
  createdAtIso?: string;
  /** Sellable units (piece / box / weight). Single-unit products carry one default variant. */
  variants?: ProductVariant[];
  defaultVariantId?: string;
}

/** A sellable, stocked unit of a product (migration 0007). Money in major units. */
export interface ProductVariant {
  id: string;
  sku: string;
  nameAr: string;
  nameEn?: string;
  unitAr?: string;
  unitEn?: string;
  unitValue?: number;
  unitMeasure?: 'L' | 'ml' | 'kg' | 'g' | 'pc';
  price: number;
  oldPrice?: number;
  discountPercentage?: number;
  inStock: boolean;
  stockQuantity: number;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
}

export interface Offer {
  id: string;
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  discountBadgeAr: string;
  discountBadgeEn: string;
  expiryDate?: string;
  theme: 'amber' | 'gold' | 'sunset';
  productId?: string;
  categoryId?: string;
  slug: string;
  /** The promotion this banner belongs to (migration 0008: banners are promotion rows). */
  promotionId?: string;
}

/** A promotion rule (migration 0008) — automatic or by code; money in major units, percent as percent. */
export interface Promotion {
  id: string;
  kind: 'automatic' | 'code';
  code?: string;
  type: 'percentage' | 'fixed' | 'free_delivery' | 'free_gift';
  value: number;
  maxDiscount?: number;
  minOrder: number;
  scope: 'cart' | 'category' | 'product';
  productIds: string[];
  categoryIds: string[];
  giftProductId?: string;
  startsAt?: string;
  expiresAt?: string;
  isActive: boolean;
  usageLimit?: number;
  perUserLimit: number;
  usageCount: number;
  showBanner: boolean;
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  /** Admin-entered badge text (may be empty). */
  badgeAr: string;
  badgeEn: string;
  /** What the storefront shows: the admin text, else derived from the rule. */
  displayBadgeAr: string;
  displayBadgeEn: string;
  imageUrl?: string;
  theme: 'amber' | 'gold' | 'sunset';
  sortOrder: number;
  slug?: string;
  createdAt: string;
}

/** A promotion that changed this cart / quote / order, as shown to the customer. */
export interface AppliedPromotionDto {
  id: string;
  code?: string | null;
  type: 'percentage' | 'fixed' | 'free_delivery' | 'free_gift';
  titleAr?: string;
  titleEn?: string;
  discount: number;
  freeDelivery: boolean;
  giftProductId?: string | null;
}

export type AccountStatus = 'active' | 'suspended' | 'disabled' | 'pending_verification';

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  defaultVillage: string;
  avatar?: string;
  houseImage?: string;
  dateOfBirth?: string;
  preferredLanguage?: Language;
  status?: AccountStatus;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  twoFactorEnabled?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
  roleId?: string;
  directPermissions?: import('../security/permissions').PermissionKey[];
}

export type AddressLabel = 'home' | 'work' | 'other';

export interface Address {
  id: string;
  title: string;
  label?: AddressLabel;
  recipientName: string;
  phone: string;
  village: string;
  streetAddress: string;
  landmark?: string;
  notes?: string;
  isDefault?: boolean;
  /** Delivery zone the address resolves to (the fee source); absent for legacy free-text villages. */
  zoneId?: string;
}

export interface DeliveryZone {
  id: string;
  nameAr: string;
  nameEn: string;
  deliveryFee: number;
  estimatedTimeAr: string;
  estimatedTimeEn: string;
  minOrder: number;
  /** Admin-only fields (the public list only returns active zones). */
  isActive?: boolean;
  sortOrder?: number;
}

export type OrderStatus = 'pending' | 'preparing' | 'on_the_way' | 'delivered' | 'cancelled';
export type PaymentMethod = 'cod' | 'vodafone_cash' | 'instapay';
export type ApiPaymentStatus =
  | 'pending'
  | 'authorized'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'cancelled';

export interface OrderItem {
  id: string;
  productId?: string;
  productNameAr: string;
  productNameEn?: string;
  unit: string;
  quantity: number;
  price: number;
  total: number;
  image: string;
  variantId?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  deliveryAddress: Address;
  estimatedDelivery: string;
  manual?: boolean;
  refunded?: boolean;
  /** Additive fields — richer lifecycle, safe to ignore. */
  paymentStatus?: ApiPaymentStatus;
  tax?: number;
  couponCode?: string;
  createdAtIso?: string;
}

export interface OrderCourier {
  driverName: string;
  driverPhone: string;
  status: string;
}

/** Staff-only view of an order: adds the assigned courier and the customer's house
 * photo (from their profile, §house photo) — never sent to the customer-facing route. */
export interface AdminOrderDetail extends Order {
  courier?: OrderCourier;
  customerHouseImage?: string;
}

export interface CartLine {
  product: Product;
  quantity: number;
  /** The variant this line is for; `variant` carries its label and unit price. */
  variantId?: string;
  variant?: { id: string; nameAr: string; nameEn?: string; unitAr?: string; unitEn?: string; price: number; isDefault: boolean };
  unitPrice?: number;
}

/** Server-authoritative priced cart (§8). The client renders this; never recomputes. */
export interface PricedCart {
  items: CartLine[];
  /** The zone whose fee is applied (signed-in customer's default address); null → store default fee. */
  deliveryZone?: { id: string; nameAr: string; nameEn: string; estimatedTimeAr: string; estimatedTimeEn: string } | null;
  /** Automatic promotions applied to this cart (the `discount` below is their sum). */
  appliedPromotions?: AppliedPromotionDto[];
  totalItems: number;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  tax: number;
  total: number;
  freeDeliveryThreshold: number;
  freeDeliveryProgress: number;
  couponCode?: string;
  currency: string;
}

// ---- Admin module DTOs (mirror apps/web/src/types/index.ts) ----

export type CustomerStatus = 'active' | 'blocked';
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  village: string;
  ordersCount: number;
  totalSpent: number;
  joinedAt: string;
  status: CustomerStatus;
}

export type RoleStatus = 'active' | 'disabled';
export interface Role {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  permissions: import('../security/permissions').PermissionKey[] | '*';
  isSystem: boolean;
  status: RoleStatus;
  userCount: number;
  createdAt: string;
}

export type StaffStatus = 'active' | 'suspended' | 'disabled';
export interface StaffUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
  roleId: string;
  directPermissions: import('../security/permissions').PermissionKey[];
  status: StaffStatus;
  lastLoginAt?: string;
  createdAt: string;
}

export type AuditResult = 'success' | 'failure';
export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  resource: string;
  /** Id of the touched row (order/product/user…) — lets the client deep-link to it. */
  resourceId?: string;
  target?: string;
  timestamp: string;
  result: AuditResult;
  metadata?: Record<string, string>;
  /** Forensics (P2-11): the request that produced the entry. Staff-only, never public. */
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface StoreSettings {
  storeNameAr: string;
  storeNameEn: string;
  phone: string;
  whatsapp: string;
  addressAr: string;
  deliveryFee: number;
  freeDeliveryThreshold: number;
  workingHours: string;
  codEnabled: boolean;
  onlinePaymentsEnabled: boolean;
  maintenanceMode: boolean;
}

/** Money the store actually received (captured), gave back, and kept. Never negative. */
export interface CollectedTotals {
  gross: number;
  refunded: number;
  net: number;
  paidCount: number;
  pendingCount: number;
}

export interface SalesReport {
  range: { from?: string; to?: string };
  /** Booked (non-cancelled) orders in range. */
  totalOrders: number;
  cancelledOrders: number;
  /** Sum of non-cancelled order totals — what was sold, regardless of collection. */
  salesTotal: number;
  averageOrderValue: number;
  customers: number;
  collected: CollectedTotals;
  /** Alias of `collected.gross`, kept for clients that predate `collected`. */
  totalRevenue: number;
  byStatus: { status: string; count: number }[];
  byCategory: { categoryId: string; nameAr: string; nameEn: string; revenue: number }[];
  byMethod: { method: string; revenue: number }[];
  topProducts: { productId: string; nameAr: string; quantity: number; revenue: number }[];
}
