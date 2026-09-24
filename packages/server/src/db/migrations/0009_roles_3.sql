-- 0009_roles_3 — three roles (owner decision): owner / store manager / staff.
--   * upserts the three system roles and resets their permission bundles to match
--     security/permissions.ts (the integration test asserts DB == code)
--   * moves every user off the retired roles (finance → store manager: refunds are a
--     manager power; order/inventory/support → staff; product/marketing → store manager;
--     super admin → owner) and deletes the retired roles
--   * users.role_id finally gets a foreign key (SET NULL) so a dangling role can't exist
-- Idempotent.
--
-- Rollback (manual): re-run `npm run db:seed` from the previous release to recreate the
-- old roles, then UPDATE users.role_id back from an audit export; DROP CONSTRAINT users_role_id_fk.

INSERT INTO roles (id, name_ar, name_en, description_ar, description_en, is_wildcard, is_system, status) VALUES
  ('role_owner', 'المالك', 'Owner', 'صلاحيات كاملة على المتجر والنظام: الموظفون والأدوار والتكاملات والإعدادات.', 'Full control over the store and the system: staff, roles, integrations and settings.', true, true, 'active'),
  ('role_store_manager', 'مدير المتجر', 'Store Manager', 'يدير كل العمليات اليومية — الكتالوج والطلبات والمدفوعات والاستردادات والعروض والتقارير — دون الأدوار وإنشاء/حذف الموظفين والتكاملات وإعدادات النظام.', 'Runs every daily operation — catalog, orders, payments, refunds, promotions, reports — without roles, creating/deleting staff, integrations or system settings.', false, true, 'active'),
  ('role_staff', 'موظف', 'Staff', 'يجهّز الطلبات ويحدّث حالاتها ويضبط المخزون ويطّلع على المنتجات والعملاء. اعتماد التسليم (تحصيل النقد) والاستردادات لمدير المتجر.', 'Prepares orders, updates their status, adjusts stock, and views products and customers. Delivery approval (cash capture) and refunds belong to the store manager.', false, true, 'active')
ON CONFLICT (id) DO UPDATE SET
  name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en,
  description_ar = EXCLUDED.description_ar, description_en = EXCLUDED.description_en,
  is_wildcard = EXCLUDED.is_wildcard, is_system = true, status = 'active';
--> statement-breakpoint
DELETE FROM role_permissions WHERE role_id IN ('role_store_manager', 'role_staff');
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_key) VALUES
  ('role_store_manager', 'products:view'), ('role_store_manager', 'products:create'), ('role_store_manager', 'products:edit'), ('role_store_manager', 'products:delete'), ('role_store_manager', 'products:export'), ('role_store_manager', 'products:manage'),
  ('role_store_manager', 'categories:view'), ('role_store_manager', 'categories:create'), ('role_store_manager', 'categories:edit'), ('role_store_manager', 'categories:delete'), ('role_store_manager', 'categories:manage'),
  ('role_store_manager', 'inventory:view'), ('role_store_manager', 'inventory:edit'), ('role_store_manager', 'inventory:export'), ('role_store_manager', 'inventory:manage'),
  ('role_store_manager', 'orders:view'), ('role_store_manager', 'orders:create'), ('role_store_manager', 'orders:edit'), ('role_store_manager', 'orders:delete'), ('role_store_manager', 'orders:export'), ('role_store_manager', 'orders:approve'), ('role_store_manager', 'orders:manage'),
  ('role_store_manager', 'customers:view'), ('role_store_manager', 'customers:edit'), ('role_store_manager', 'customers:export'), ('role_store_manager', 'customers:manage'),
  ('role_store_manager', 'promotions:view'), ('role_store_manager', 'promotions:create'), ('role_store_manager', 'promotions:edit'), ('role_store_manager', 'promotions:delete'), ('role_store_manager', 'promotions:manage'),
  ('role_store_manager', 'payments:view'), ('role_store_manager', 'payments:export'), ('role_store_manager', 'payments:approve'), ('role_store_manager', 'payments:manage'),
  ('role_store_manager', 'reports:view'), ('role_store_manager', 'reports:export'),
  ('role_store_manager', 'users:view'), ('role_store_manager', 'users:edit'), ('role_store_manager', 'users:manage'),
  ('role_store_manager', 'audit:view'), ('role_store_manager', 'audit:export'),
  ('role_store_manager', 'settings:view'),
  ('role_staff', 'orders:view'), ('role_staff', 'orders:edit'),
  ('role_staff', 'inventory:view'), ('role_staff', 'inventory:edit'),
  ('role_staff', 'products:view'),
  ('role_staff', 'customers:view')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE users SET role_id = 'role_owner' WHERE role_id = 'role_super_admin';
--> statement-breakpoint
UPDATE users SET role_id = 'role_store_manager' WHERE role_id IN ('role_product_manager', 'role_marketing_manager', 'role_finance');
--> statement-breakpoint
UPDATE users SET role_id = 'role_staff' WHERE role_id IN ('role_order_manager', 'role_inventory_manager', 'role_customer_support');
--> statement-breakpoint
DELETE FROM roles WHERE id IN ('role_super_admin', 'role_product_manager', 'role_marketing_manager', 'role_finance', 'role_order_manager', 'role_inventory_manager', 'role_customer_support');
--> statement-breakpoint
UPDATE users SET role_id = NULL WHERE role_id IS NOT NULL AND role_id NOT IN (SELECT id FROM roles);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_id_fk') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_id_fk FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL;
  END IF;
END $$;
