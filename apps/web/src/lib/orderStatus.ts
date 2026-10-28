import type { OrderStatus, DetailedOrderStatus, DeliveryJobStatus, ReasonCode } from '../types';
import type { StatusTone } from '../components/ui/StatusPill';

export const ORDER_STATUS_TONE: Record<OrderStatus, StatusTone> = {
  pending: 'warning',
  preparing: 'info',
  on_the_way: 'info',
  delivered: 'success',
  cancelled: 'danger',
};

export const DETAILED_STATUS_TONE: Record<DetailedOrderStatus, StatusTone> = {
  pending_confirmation: 'warning',
  confirmed: 'info',
  preparing: 'info',
  ready_for_pickup: 'info',
  out_for_delivery: 'info',
  delivered: 'success',
  rejected: 'danger',
  cancelled: 'danger',
  delivery_exception: 'warning',
};

export const DELIVERY_STATUS_TONE: Record<DeliveryJobStatus, StatusTone> = {
  awaiting_dispatch: 'neutral',
  searching_driver: 'warning',
  assigned: 'info',
  accepted: 'info',
  heading_to_pickup: 'info',
  arrived_at_pickup: 'info',
  picked_up: 'info',
  in_transit: 'info',
  arrived_at_dropoff: 'info',
  delivered: 'success',
  failed: 'danger',
  returning: 'warning',
  returned_to_pharmacy: 'danger',
  cancelled: 'neutral',
};

export const DETAILED_STATUS_LABELS_AR: Record<DetailedOrderStatus, string> = {
  pending_confirmation: 'بانتظار التأكيد',
  confirmed: 'تم التأكيد',
  preparing: 'جاري تجهيز الأدوية',
  ready_for_pickup: 'جاهز للاستلام والتوصيل',
  out_for_delivery: 'في الطريق مع المندوب',
  delivered: 'تم التسليم بنجاح',
  rejected: 'تعذر قبول الطلب',
  cancelled: 'طلب ملغي',
  delivery_exception: 'مشكلة في التوصيل',
};

export const CUSTOMER_STATUS_MESSAGES_AR: Record<DetailedOrderStatus, string> = {
  pending_confirmation: 'تم تسجيل طلبك وبانتظار مراجعة الصيدلية',
  confirmed: 'تم تأكيد طلبك وجاري البدء في تحضيره',
  preparing: 'الصيدلي يقوم بتحضير وتغليف أدويتك',
  ready_for_pickup: 'أدويتك جاهزة وبانتظار تحرك مندوب التوصيل',
  out_for_delivery: 'طلبك في الطريق إليك مع المندوب',
  delivered: 'تم تسليم طلبك بنجاح. بالشفاء العاجل!',
  rejected: 'تعذر قبول الطلب، يرجى التواصل مع الصيدلية',
  cancelled: 'تم إلغاء الطلب',
  delivery_exception: 'نعمل على حل مشكلة التوصيل وسنتواصل معك',
};

export const DELIVERY_STATUS_LABELS_AR: Record<DeliveryJobStatus, string> = {
  awaiting_dispatch: 'بانتظار التوزيع',
  searching_driver: 'جاري البحث عن مندوب',
  assigned: 'تم إسناد المهمة',
  accepted: 'المندوب قبل المهمة',
  heading_to_pickup: 'المندوب متجه للصيدلية',
  arrived_at_pickup: 'وصل للصيدلية',
  picked_up: 'استلم الأدوية من الصيدلية',
  in_transit: 'في الطريق للعميل',
  arrived_at_dropoff: 'وصل لعنوان العميل',
  delivered: 'تم التسليم بنجاح',
  failed: 'فشل التوصيل',
  returning: 'جاري إرجاع الأدوية للصيدلية',
  returned_to_pharmacy: 'تم استرجاع الطلب للصيدلية',
  cancelled: 'مهمة ملغية',
};

export const REASON_CODE_LABELS_AR: Record<string, string> = {
  NO_ELIGIBLE_DRIVERS: 'لا يوجد مندوب متاح في النطاق الجغرافي',
  DRIVER_REJECTED: 'المندوب اعتذر عن استكمال التوصيل',
  DRIVER_TIMEOUT: 'انتهت مهلة استجابة المندوب',
  PHARMACY_NOT_READY: 'الطلب ما زال قيد التجهيز في الصيدلية',
  PICKUP_VERIFICATION_FAILED: 'فشل التحقق من محتويات الأدوية عند الاستلام',
  CUSTOMER_UNAVAILABLE: 'العميل لا يجيب أو الهاتف غير متاح',
  INVALID_DELIVERY_ADDRESS: 'عنوان التوصيل غير دقيق أو خارج نطاق التغطية',
  CUSTOMER_REFUSED_ORDER: 'العميل رفض استلام الشحنة',
  DELIVERY_FAILED: 'تعذر إتمام التوصيل لسبب طارئ',
  RETURN_REQUIRED: 'يتطلب إرجاع الشحنة للصيدلية',
  SYNC_FAILED: 'فشل مزامنة الحالة بين النظامين',
  INVALID_STATE_TRANSITION: 'محاولة انتقال حالة غير مسموح بها',
  DUPLICATE_EVENT: 'حدث مكرر تم تجاهله',
  PAYMENT_FAILED: 'فشلت عملية الدفع',
  MANUAL_ADMIN_OVERRIDE: 'تدخل وتعديل يدوي من إدارة الصيدلية',
  OUT_OF_STOCK: 'الدواء غير متوفر حالياً في المخزن',
  PRESCRIPTION_REJECTED: 'تم رفض الروشتة الطبية ويلزم زيارة الفرع',
};

export type OrderFilter = 'all' | 'processing' | 'on_the_way' | 'delivered' | 'cancelled';

/** Maps the account Orders filter tabs to the underlying OrderStatus values */
export function matchesFilter(status: OrderStatus, filter: OrderFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'processing':
      return status === 'pending' || status === 'preparing';
    case 'on_the_way':
      return status === 'on_the_way';
    case 'delivered':
      return status === 'delivered';
    case 'cancelled':
      return status === 'cancelled';
  }
}

/** Ordered pipeline steps for customer order timeline */
export const ORDER_PIPELINE: OrderStatus[] = ['pending', 'preparing', 'on_the_way', 'delivered'];
