import type { ElementType } from 'react';
import type { Resource } from '../../types';
import {
  LayoutDashboard,
  Users,
  Package,
  FolderTree,
  Boxes,
  ShoppingCart,
  UserRound,
  Ticket,
  CreditCard,
  BarChart3,
  Plug,
  ScrollText,
  Settings,
  KeyRound,
  MapPin,
} from 'lucide-react';

export interface AdminNavItem {
  href: string;
  labelKey: string; // key under t.admin
  icon: ElementType;
  /** required resource:view permission; omitted = any admin access */
  resource?: Resource;
  group: 'main' | 'catalog' | 'operations' | 'system';
}

export const ADMIN_NAV: AdminNavItem[] = [
  { href: '/control-center', labelKey: 'navOverview', icon: LayoutDashboard, group: 'main' },
  // Roles are fixed (owner / store manager / staff) — assigned on the user page, never authored here.
  { href: '/control-center/users', labelKey: 'navUsers', icon: Users, resource: 'users', group: 'main' },

  { href: '/control-center/products', labelKey: 'navProducts', icon: Package, resource: 'products', group: 'catalog' },
  { href: '/control-center/categories', labelKey: 'navCategories', icon: FolderTree, resource: 'categories', group: 'catalog' },
  { href: '/control-center/inventory', labelKey: 'navInventory', icon: Boxes, resource: 'inventory', group: 'catalog' },

  { href: '/control-center/orders', labelKey: 'navOrders', icon: ShoppingCart, resource: 'orders', group: 'operations' },
  { href: '/control-center/customers', labelKey: 'navCustomers', icon: UserRound, resource: 'customers', group: 'operations' },
  { href: '/control-center/promotions', labelKey: 'navPromotions', icon: Ticket, resource: 'promotions', group: 'operations' },
  { href: '/control-center/payments', labelKey: 'navPayments', icon: CreditCard, resource: 'payments', group: 'operations' },
  { href: '/control-center/reports', labelKey: 'navReports', icon: BarChart3, resource: 'reports', group: 'operations' },
  { href: '/control-center/delivery-zones', labelKey: 'navDeliveryZones', icon: MapPin, resource: 'settings', group: 'operations' },

  { href: '/control-center/integrations', labelKey: 'navIntegrations', icon: Plug, resource: 'integrations', group: 'system' },
  { href: '/control-center/api-keys', labelKey: 'navApiKeys', icon: KeyRound, resource: 'integrations', group: 'system' },
  { href: '/control-center/audit-log', labelKey: 'navAudit', icon: ScrollText, resource: 'audit', group: 'system' },
  { href: '/control-center/settings', labelKey: 'navSettings', icon: Settings, resource: 'settings', group: 'system' },
];

export const ADMIN_GROUPS: { key: AdminNavItem['group']; labelAr: string; labelEn: string }[] = [
  { key: 'main', labelAr: 'الرئيسية', labelEn: 'Main' },
  { key: 'catalog', labelAr: 'الكتالوج', labelEn: 'Catalog' },
  { key: 'operations', labelAr: 'العمليات', labelEn: 'Operations' },
  { key: 'system', labelAr: 'النظام', labelEn: 'System' },
];
