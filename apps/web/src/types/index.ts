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
  /** Presentation-only accent for category tiles/rails */
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
  unitAr: string; // e.g. "1.5 لتر" or "1 كجم" or "علبة 500 جرام"
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
  /** Presentation-only fields (all optional — no business logic depends on them) */
  images?: string[];
  rating?: number; // 0–5
  reviewCount?: number;
  unitValue?: number; // e.g. 1.5
  unitMeasure?: 'L' | 'ml' | 'kg' | 'g' | 'pc';
  lowStockThreshold?: number; // defaults to 5 in the UI
  /** Sellable units (piece / box / weight). Single-unit products carry one default variant. */
  variants?: ProductVariant[];
  defaultVariantId?: string;
  tags?: string[];
  isNew?: boolean;
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
  /** Visual theme resolved to gradient classes inside OfferCard (purge-safe) */
  theme: 'amber' | 'gold' | 'sunset';
  productId?: string;
  categoryId?: string;
  slug: string;
  /** The promotion rule this banner belongs to (banners are promotion rows since 0008). */
  promotionId?: string;
}

export type PromotionType = 'percentage' | 'fixed' | 'free_delivery' | 'free_gift';
export type PromotionScope = 'cart' | 'category' | 'product';

/** A promotion rule (mirrors @ragab/server Promotion). Money in EGP, percent as percent. */
export interface Promotion {
  id: string;
  kind: 'automatic' | 'code';
  code?: string;
  type: PromotionType;
  value: number;
  maxDiscount?: number;
  minOrder: number;
  scope: PromotionScope;
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
  badgeAr: string;
  badgeEn: string;
  displayBadgeAr: string;
  displayBadgeEn: string;
  imageUrl?: string;
  theme: 'amber' | 'gold' | 'sunset';
  sortOrder: number;
  slug?: string;
  createdAt: string;
}

/** A promotion that changed the cart / quote, as the server reports it. */
export interface AppliedPromotion {
  id: string;
  code?: string | null;
  type: PromotionType;
  titleAr?: string;
  titleEn?: string;
  discount: number;
  freeDelivery: boolean;
  giftProductId?: string | null;
}

export interface CartItem {
  product: Product;
  quantity: number;
  /** The variant this line is for (server-assigned; absent only in optimistic client state). */
  variantId?: string;
  variant?: { id: string; nameAr: string; nameEn?: string; unitAr?: string; unitEn?: string; price: number; isDefault: boolean };
  unitPrice?: number;
}

/** A sellable, stocked unit of a product (mirrors @ragab/server ProductVariant). */
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

export type AccountStatus = 'active' | 'suspended' | 'disabled' | 'pending_verification';

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  defaultVillage: string;
  /** Presentation/account fields — all optional so existing mock users keep working */
  avatar?: string;
  dateOfBirth?: string;
  preferredLanguage?: Language;
  status?: AccountStatus;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  twoFactorEnabled?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
  /** Staff-only: set when this account is an admin/staff member */
  roleId?: string;
  /** Staff-only: permissions granted directly, on top of the role */
  directPermissions?: PermissionKey[];
}

export type AddressLabel = 'home' | 'work' | 'other';

export interface Address {
  id: string;
  title: string; // e.g. "المنزل - عليم"
  label?: AddressLabel; // Home / Work / Other — drives the label chip & icon
  recipientName: string;
  phone: string;
  village: string; // e.g. "قرية عليم"
  /** Delivery zone the address resolves to (drives the fee); absent for legacy free-text villages. */
  zoneId?: string;
  streetAddress: string;
  landmark?: string;
  notes?: string;
  isDefault?: boolean;
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
  paymentMethod: 'cod' | 'vodafone_cash' | 'instapay';
  deliveryAddress: Address;
  estimatedDelivery: string;
  /** Admin-set: order was created manually by staff (phone/walk-in) */
  manual?: boolean;
  /** Admin-set: a refund was issued against this order */
  refunded?: boolean;
  /** Server-owned payment lifecycle (mirrors @ragab/server ApiPaymentStatus). */
  paymentStatus?: 'pending' | 'authorized' | 'paid' | 'failed' | 'refunded' | 'partially_refunded' | 'cancelled';
  tax?: number;
  couponCode?: string;
  createdAtIso?: string;
}

/* ============================================================
 * Bilingual helper
 * ========================================================== */

export interface LocalizedText {
  ar: string;
  en: string;
}

/* ============================================================
 * Notifications
 * ========================================================== */

export type NotificationCategory = 'order' | 'promo' | 'account' | 'security' | 'general';

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  createdAt: string;
  read: boolean;
  href?: string;
}

/* ============================================================
 * Security — sessions & login activity
 * ========================================================== */

export interface Session {
  id: string;
  device: string; // e.g. "iPhone 14" / "Windows PC"
  deviceType: 'mobile' | 'tablet' | 'desktop';
  browser: string; // e.g. "Chrome 122"
  approxLocation?: string; // e.g. "الشرقية، مصر"
  lastActive: string;
  current: boolean;
}

export type LoginActivityResult = 'success' | 'failed';

export interface LoginActivity {
  id: string;
  device: string;
  browser: string;
  approxLocation?: string;
  timestamp: string;
  result: LoginActivityResult;
}

/* ============================================================
 * RBAC — Roles, Permissions, Staff
 * ========================================================== */

export type Resource =
  | 'products'
  | 'categories'
  | 'orders'
  | 'customers'
  | 'inventory'
  | 'promotions'
  | 'payments'
  | 'reports'
  | 'users'
  | 'roles'
  | 'settings'
  | 'integrations'
  | 'audit';

export type Action =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'export'
  | 'approve'
  | 'manage';

/** A single permission encoded as `${resource}:${action}` for O(1) Set lookups */
export type PermissionKey = `${Resource}:${Action}`;

export type RoleStatus = 'active' | 'disabled';

export interface Role {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  /** '*' grants every permission (Super Admin) */
  permissions: PermissionKey[] | '*';
  isSystem: boolean; // seeded default roles cannot be deleted
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
  /** permissions granted directly on top of the role */
  directPermissions: PermissionKey[];
  status: StaffStatus;
  lastLoginAt?: string;
  createdAt: string;
}

/* ============================================================
 * Audit log
 * ========================================================== */

export type AuditResult = 'success' | 'failure';

export type AuditAction =
  | 'login'
  | 'logout'
  | 'user_created'
  | 'user_updated'
  | 'user_removed'
  | 'role_changed'
  | 'role_created'
  | 'permission_changed'
  | 'product_updated'
  | 'category_updated'
  | 'promotion_updated'
  | 'customer_updated'
  | 'inventory_adjusted'
  | 'order_status_changed'
  | 'refund_issued'
  | 'order_cancelled_refunded'
  | 'payment_confirmed'
  | 'invoice_sent'
  | 'settings_changed';

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: AuditAction;
  resource: Resource | 'auth';
  /** Id of the touched row — the audit drawer deep-links to it when a page exists. */
  resourceId?: string;
  target?: string; // human-readable target, e.g. "طلب #MHS-10234"
  timestamp: string;
  result: AuditResult;
  metadata?: Record<string, string>;
  /** Forensics shown in the detail drawer (P2-11). */
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/* ============================================================
 * Admin module entities (Customers, Payments, Content, Integrations, Settings)
 * ========================================================== */

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

export type PaymentStatus = 'paid' | 'pending' | 'refunded' | 'failed' | 'cancelled';

export interface PaymentTransaction {
  id: string;
  orderId?: string;
  orderNumber: string;
  customerName: string;
  method: 'cod' | 'vodafone_cash' | 'instapay';
  amount: number;
  status: PaymentStatus;
  /** Lifecycle of the linked order — a cancelled order can never be confirmed as paid. */
  orderStatus?: OrderStatus;
  date: string;
}

/** Money actually received (captured), given back, and kept — server-computed, never negative. */
export interface CollectedTotals {
  gross: number;
  refunded: number;
  net: number;
  paidCount: number;
  pendingCount: number;
}

/** The single server-side report every dashboard renders (mirrors @ragab/server SalesReport). */
export interface SalesReport {
  range: { from?: string; to?: string };
  totalOrders: number;
  cancelledOrders: number;
  salesTotal: number;
  averageOrderValue: number;
  customers: number;
  collected: CollectedTotals;
  totalRevenue: number;
  byStatus: { status: OrderStatus; count: number }[];
  byCategory: { categoryId: string; nameAr: string; nameEn: string; revenue: number }[];
  byMethod: { method: string; revenue: number }[];
  topProducts: { productId: string; nameAr: string; quantity: number; revenue: number }[];
}

export interface Integration {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  category: 'payment' | 'delivery' | 'analytics' | 'messaging';
  enabled: boolean;
  connected: boolean;
}

export type InvoiceStatus = 'sent' | 'viewed';

export interface InvoiceLine {
  name: string;
  quantity: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string; // e.g. INV-98440
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  amount: number;
  lines: InvoiceLine[];
  issuedAt: string;
  status: InvoiceStatus;
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
