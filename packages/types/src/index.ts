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
  requiresPrescription?: boolean;
  prescriptionInstructionsAr?: string;
  prescriptionInstructionsEn?: string;
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
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  defaultVillage: string;
}

export interface Address {
  id: string;
  title: string;
  recipientName: string;
  phone: string;
  village: string;
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
}

export type OrderStatus = 'pending' | 'preparing' | 'on_the_way' | 'delivered' | 'cancelled';

export type DetailedOrderStatus =
  | 'pending_confirmation'
  | 'confirmed'
  | 'preparing'
  | 'ready_for_pickup'
  | 'out_for_delivery'
  | 'delivered'
  | 'rejected'
  | 'cancelled'
  | 'delivery_exception';

export type DeliveryJobStatus =
  | 'awaiting_dispatch'
  | 'searching_driver'
  | 'assigned'
  | 'accepted'
  | 'heading_to_pickup'
  | 'arrived_at_pickup'
  | 'picked_up'
  | 'in_transit'
  | 'arrived_at_dropoff'
  | 'delivered'
  | 'failed'
  | 'returning'
  | 'returned_to_pharmacy'
  | 'cancelled';

export type UnifiedPaymentStatus =
  | 'unpaid'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refund_pending'
  | 'partially_refunded'
  | 'refunded'
  | 'cancelled';

export type ReasonCode =
  | 'NO_ELIGIBLE_DRIVERS'
  | 'DRIVER_REJECTED'
  | 'DRIVER_TIMEOUT'
  | 'PHARMACY_NOT_READY'
  | 'PICKUP_VERIFICATION_FAILED'
  | 'CUSTOMER_UNAVAILABLE'
  | 'INVALID_DELIVERY_ADDRESS'
  | 'CUSTOMER_REFUSED_ORDER'
  | 'DELIVERY_FAILED'
  | 'RETURN_REQUIRED'
  | 'SYNC_FAILED'
  | 'INVALID_STATE_TRANSITION'
  | 'DUPLICATE_EVENT'
  | 'PAYMENT_FAILED'
  | 'MANUAL_ADMIN_OVERRIDE'
  | 'OUT_OF_STOCK'
  | 'PRESCRIPTION_REJECTED';

export interface OrderEventDto {
  eventId: string;
  orderId: string;
  deliveryId?: string;
  eventType: string;
  entityType: 'order' | 'delivery' | 'payment';
  fromStatus?: string | null;
  toStatus: string;
  actorType: 'customer' | 'pharmacist' | 'courier' | 'admin' | 'system';
  actorId?: string;
  actorName?: string;
  sourceApp: 'ragab_web' | 'ragab_mobile' | 'engezny_web' | 'engezny_mobile' | 'backend';
  reasonCode?: ReasonCode | string;
  outcome: 'success' | 'failed' | 'rejected';
  errorCode?: string;
  errorMessage?: string;
  correlationId?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface StuckInfo {
  isStuck: boolean;
  minutesInCurrentStatus: number;
  thresholdMinutes: number;
  alertLevel: 'none' | 'warning' | 'critical';
  recommendedAction: string;
  recommendedActionAr: string;
}

export interface DeliveryJobDetail {
  deliveryId?: string;
  status: DeliveryJobStatus;
  driverName?: string;
  driverPhone?: string;
  deliveryPhotoUrl?: string;
  deliveryCode?: string;
  assignedAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  failedAt?: string;
  failureReason?: string;
  returnConfirmed?: boolean;
}

export interface OrderItem {
  requiresPrescription?: boolean;
  id: string;
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
  hasPrescriptionItems?: boolean;
  prescriptionUrl?: string;
  prescriptionStatus?: 'pending' | 'approved' | 'rejected_visit_required';
  prescriptionRejectionReason?: string;
  detailedStatus?: DetailedOrderStatus;
  deliveryStatus?: DeliveryJobStatus;
  deliveryJob?: DeliveryJobDetail;
  stuckInfo?: StuckInfo;
  events?: OrderEventDto[];
  reasonCode?: string;
  correlationId?: string;
  courier?: OrderCourier;
}

export interface OrderCourier {
  driverName: string;
  driverPhone: string;
  status: string;
}

export interface BusinessConfig {
  nameAr: string;
  nameEn: string;
  sloganAr: string;
  sloganEn: string;
  locationAr: string;
  locationFullAr: string;
  defaultCurrencyAr: string;
  defaultCurrencyEn: string;
  contactPhone: string;
  whatsappNumber: string;
  workingHoursAr: string;
  freeDeliveryThreshold: number;
  standardDeliveryFee: number;
  supportedVillages: string[];
}

// --- Realtime Events Definitions ---

export type RealtimeTopic = 'admin_orders' | 'customer_orders' | 'store_ops';

export interface BaseRealtimeEvent<TName extends string, TData> {
  event: TName;
  topic: RealtimeTopic;
  data: TData;
  eventId: string;
  timestamp: string; // ISO 8601
  version: number;
}

export type OrderStatusUpdatedEvent = BaseRealtimeEvent<
  'order.status_updated',
  {
    orderId: string;
    orderNumber: string;
    status: OrderStatus;
    updatedBy?: string;
  }
>;

export type OrderCreatedEvent = BaseRealtimeEvent<
  'order.created',
  {
    order: Order; 
  }
>;

export type ProductRequestedEvent = BaseRealtimeEvent<
  'product.requested',
  {
    requestId: string;
    productId?: string;
    productNameAr: string;
    customerName: string;
    customerPhone: string;
    imageUrl?: string;
    isCustom?: boolean;
  }
>;

export type PrescriptionCreatedEvent = BaseRealtimeEvent<
  'prescription.created',
  {
    prescriptionId: string;
    customerName: string;
    customerPhone: string;
  }
>;

export type PrescriptionReviewedEvent = BaseRealtimeEvent<
  'prescription.reviewed',
  {
    prescriptionId: string;
    userId?: string;
    itemCount: number;
    totalAmount: number;
  }
>;

export type AppRealtimeEvent =
  | OrderStatusUpdatedEvent
  | OrderCreatedEvent
  | ProductRequestedEvent
  | PrescriptionCreatedEvent
  | PrescriptionReviewedEvent;

export type ProductRequestStatus = 'pending' | 'fulfilled' | 'cancelled';

export interface ProductRequest {
  id: string;
  productId?: string;
  variantId?: string;
  variantName?: string;
  productNameAr: string;
  productNameEn?: string;
  productSlug?: string;
  customerName: string;
  customerPhone: string;
  userId?: string;
  notes?: string;
  imageUrl?: string;
  isCustom?: boolean;
  status: ProductRequestStatus;
  createdAt: string;
  updatedAt: string;
  fulfilledAt?: string;
  productImage?: string;
  categoryNameAr?: string;
}

export type PrescriptionStatus = 'pending' | 'reviewed' | 'completed' | 'rejected';

export interface PrescriptionItem {
  productId: string;
  variantId?: string;
  productNameAr: string;
  productNameEn?: string;
  productImage?: string;
  productSlug?: string;
  quantity: number;
  price: number;
  instructions?: string;
}

export interface Prescription {
  id: string;
  userId?: string;
  customerName: string;
  customerPhone: string;
  imageUrl: string;
  notes?: string;
  status: PrescriptionStatus;
  items: PrescriptionItem[];
  pharmacistNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  cartUpdated?: boolean;
  createdAt: string;
  updatedAt: string;
}
