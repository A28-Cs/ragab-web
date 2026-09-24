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

export interface OrderItem {
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

export type AppRealtimeEvent = OrderStatusUpdatedEvent | OrderCreatedEvent;
