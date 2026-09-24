import type { AuditAction } from '../types';

/** Maps an AuditAction to its i18n key under t.admin (e.g. 'actLogin') */
export const AUDIT_ACTION_KEY: Record<AuditAction, string> = {
  login: 'actLogin',
  logout: 'actLogout',
  user_created: 'actUserCreated',
  user_updated: 'actUserUpdated',
  user_removed: 'actUserRemoved',
  role_changed: 'actRoleChanged',
  role_created: 'actRoleCreated',
  permission_changed: 'actPermissionChanged',
  product_updated: 'actProductUpdated',
  category_updated: 'actCategoryUpdated',
  promotion_updated: 'actPromotionUpdated',
  customer_updated: 'actCustomerUpdated',
  inventory_adjusted: 'actInventoryAdjusted',
  order_status_changed: 'actOrderStatusChanged',
  refund_issued: 'actRefundIssued',
  order_cancelled_refunded: 'actOrderCancelledRefunded',
  payment_confirmed: 'actPaymentConfirmed',
  invoice_sent: 'actInvoiceSent',
  settings_changed: 'actSettingsChanged',
};
