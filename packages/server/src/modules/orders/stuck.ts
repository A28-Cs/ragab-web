import type { DetailedOrderStatus, OrderStatus, StuckInfo } from '../../types';

export const STATUS_SLA_THRESHOLDS_MINUTES: Record<string, number> = {
  pending_confirmation: 15,
  confirmed: 15,
  pending: 15,
  preparing: 30,
  ready_for_pickup: 20,
  out_for_delivery: 45,
  on_the_way: 45,
  delivery_exception: 10,
};

export function computeStuckInfo(
  status: OrderStatus | DetailedOrderStatus,
  lastChangedAt: Date | string,
  now = new Date()
): StuckInfo {
  const isTerminal = status === 'delivered' || status === 'cancelled' || status === 'rejected';
  if (isTerminal) {
    return {
      isStuck: false,
      minutesInCurrentStatus: 0,
      thresholdMinutes: 0,
      alertLevel: 'none',
      recommendedAction: 'No action needed. Order is terminal.',
      recommendedActionAr: 'لا يتطلب إجراء، الطلب مكتمل أو ملغي.',
    };
  }

  const threshold = STATUS_SLA_THRESHOLDS_MINUTES[status] ?? 30;
  const changedDate = typeof lastChangedAt === 'string' ? new Date(lastChangedAt) : lastChangedAt;
  const elapsedMs = Math.max(0, now.getTime() - (isNaN(changedDate.getTime()) ? now.getTime() : changedDate.getTime()));
  const elapsedMins = Math.floor(elapsedMs / 60000);

  const isStuck = elapsedMins >= threshold;
  const alertLevel = !isStuck ? 'none' : elapsedMins >= threshold * 2 ? 'critical' : 'warning';

  let recommendedAction = 'Monitor order progression';
  let recommendedActionAr = 'متابعة تقدم الطلب';

  if (status === 'pending' || status === 'pending_confirmation') {
    recommendedAction = 'Review and confirm the prescription/order items';
    recommendedActionAr = 'مراجعة وتأكيد بنود الطلب والروشتة';
  } else if (status === 'confirmed') {
    recommendedAction = 'Start medicine preparation in pharmacy lab';
    recommendedActionAr = 'بدء تحضير الأدوية في المعمل أو الرفوف';
  } else if (status === 'preparing') {
    recommendedAction = 'Check with pharmacy staff on drug inventory shortages';
    recommendedActionAr = 'التأكد من توفر جميع الأدوية وإنهاء تجهيز العبوة';
  } else if (status === 'ready_for_pickup') {
    recommendedAction = 'Assign or alert Engezny couriers to pick up package';
    recommendedActionAr = 'تنبيه مندوب إنجزني لاستلام الطلب من الصيدلية';
  } else if (status === 'on_the_way' || status === 'out_for_delivery') {
    recommendedAction = 'Call driver to verify customer location or transit issues';
    recommendedActionAr = 'الاتصال بالمندوب لمتابعة خط السير والوصول للعميل';
  } else if (status === 'delivery_exception') {
    recommendedAction = 'Resolve delivery dispute or reschedule delivery time';
    recommendedActionAr = 'معالجة مشكلة التوصيل أو تحديد موعد بديل مع العميل';
  }

  return {
    isStuck,
    minutesInCurrentStatus: elapsedMins,
    thresholdMinutes: threshold,
    alertLevel,
    recommendedAction,
    recommendedActionAr,
  };
}
