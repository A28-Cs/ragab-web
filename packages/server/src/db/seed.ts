/**
 * Seed (Ragab Pharmacy — isolated project). Idempotent — safe to re-run.
 *
 * Unlike Ragab Pharmacy's seed, this ONLY creates system/schema-required config
 * (store, warehouse, settings, the permission catalog + default roles) plus the
 * same test/demo accounts as the source project. It deliberately does NOT seed
 * any catalog/business data (categories, products, inventory, delivery zones,
 * integrations, promotions) — those stay empty per the migration brief.
 * Passwords are Argon2id; the admin password comes from SEED_ADMIN_PASSWORD or a
 * default that MUST be changed in production.
 */
import { eq } from 'drizzle-orm';
import { db, closeDb } from './client';
import * as s from './schema';
import { DEFAULT_STORE_ID } from './schema/system';
import { DEFAULT_WAREHOUSE_ID } from './schema/inventory';
import { RESOURCES, DEFAULT_ROLES } from '../security/permissions';
import { hashPassword } from '../security/password';
import { logger } from '../lib/logger';

const log = logger().child({ component: 'seed' });

async function seed(): Promise<void> {
  const d = db();

  // 1. Store + warehouse
  await d.insert(s.stores).values({ id: DEFAULT_STORE_ID, nameAr: 'رجب', nameEn: 'Ragab Pharmacy', slug: 'ragab-pharmacy', currency: 'EGP' }).onConflictDoNothing();
  await d.insert(s.warehouses).values({ id: DEFAULT_WAREHOUSE_ID, nameAr: 'المخزن الرئيسي', nameEn: 'Main Warehouse', isDefault: 'true' }).onConflictDoNothing();

  // 2. Settings (same delivery rule shape as the source project; the owner tunes these later)
  await d.insert(s.storeSettings).values({
    id: DEFAULT_STORE_ID,
    storeNameAr: 'رجب', storeNameEn: 'Ragab Pharmacy',
    phone: '+20 10 1234 5678', whatsapp: '+201012345678',
    addressAr: 'قرية عليم – مركز أبو حماد – محافظة الشرقية – مصر',
    deliveryFeeMinor: 1500, freeDeliveryThresholdMinor: 30000,
    workingHours: 'يومياً من 8 صباحاً حتى 12 منتصف الليل',
  }).onConflictDoNothing();
  await d.insert(s.taxSettings).values({ nameAr: 'ضريبة القيمة المضافة', nameEn: 'VAT', rateBps: 0, inclusive: true, enabled: false }).onConflictDoNothing();

  // 3. Permission catalog
  for (const r of RESOURCES) {
    for (const action of r.actions) {
      await d.insert(s.permissions).values({ resource: r.key, action, key: `${r.key}:${action}` }).onConflictDoNothing();
    }
  }

  // 4. Roles + role_permissions
  for (const role of DEFAULT_ROLES) {
    await d.insert(s.roles).values({
      id: role.id, nameAr: role.nameAr, nameEn: role.nameEn,
      descriptionAr: role.descriptionAr, descriptionEn: role.descriptionEn,
      isWildcard: role.permissions === '*', isSystem: role.isSystem, status: 'active',
    }).onConflictDoNothing();
    if (role.permissions !== '*') {
      for (const key of role.permissions) {
        await d.insert(s.rolePermissions).values({ roleId: role.id, permissionKey: key }).onConflictDoNothing();
      }
    }
  }

  // 5. Accounts — one staff login per seeded role (identical test users to Ragab Pharmacy),
  // plus a demo customer. Shared password so every account is easy to test with; MUST be
  // changed/removed before any real deployment (see docs/backend/README.md).
  const staffPw = process.env.SEED_STAFF_PASSWORD ?? 'Staff@12345';
  const STAFF_ACCOUNTS: { id: string; name: string; phone: string; email: string; roleId: string }[] = [
    { id: 'user_admin', name: 'المالك', phone: '01000000000', email: 'admin@ragab.sa', roleId: 'role_owner' },
    { id: 'user_store_manager', name: 'مدير المتجر', phone: '01000000001', email: 'store.manager@ragab.sa', roleId: 'role_store_manager' },
    { id: 'user_staff', name: 'موظف المتجر', phone: '01000000002', email: 'staff@ragab.sa', roleId: 'role_staff' },
  ];
  for (const acct of STAFF_ACCOUNTS) {
    const [existing] = await d.select({ id: s.users.id }).from(s.users).where(eq(s.users.phone, acct.phone)).limit(1);
    if (existing) continue;
    const pw = acct.roleId === 'role_owner' ? (process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345') : staffPw;
    await d.insert(s.users).values({
      id: acct.id, name: acct.name, phone: acct.phone, email: acct.email,
      passwordHash: await hashPassword(pw), defaultVillage: 'قرية عليم',
      status: 'active', emailVerified: true, phoneVerified: true,
      isStaff: true, roleId: acct.roleId,
    });
  }

  const [existingCustomer] = await d.select({ id: s.users.id }).from(s.users).where(eq(s.users.phone, '01011111111')).limit(1);
  if (!existingCustomer) {
    await d.insert(s.users).values({
      id: 'user_demo', name: 'عميل تجريبي', phone: '01011111111', email: 'customer@ragab.sa',
      passwordHash: await hashPassword('Customer@123'), defaultVillage: 'قرية عليم',
      status: 'active', phoneVerified: true, isStaff: false,
    });
  }

  log.info(
    { roles: DEFAULT_ROLES.length, staffAccounts: STAFF_ACCOUNTS.length },
    'seed complete (Ragab Pharmacy — system config + test users only, no catalog/business data)',
  );
}

seed()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (e) => {
    log.error({ err: e }, 'seed failed');
    await closeDb();
    process.exit(1);
  });
