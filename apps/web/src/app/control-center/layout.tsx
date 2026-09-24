'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Menu, Store, LogOut, UserRound, ChevronDown, ShoppingBag as OrdersIcon } from 'lucide-react';
import { cn } from '@ragab/utils';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { RequirePermission } from '../../components/auth/RequirePermission';
import { Drawer } from '../../components/ui/Drawer';
import { Avatar } from '../../components/ui/Avatar';
import { DropdownMenu } from '../../components/ui/DropdownMenu';
import { RagabLogo } from '../../components/ui/RagabLogo';
import { ADMIN_NAV, ADMIN_GROUPS, AdminNavItem } from './nav';
import { OrdersQuickAccessTrigger } from '../../components/admin/OrdersQuickAccess';

function useVisibleNav() {
  const { hasPermission } = useAuth();
  return useMemo(
    () => ADMIN_NAV.filter((item) => !item.resource || hasPermission(item.resource, 'view')),
    [hasPermission]
  );
}

const NavList: React.FC<{ onNavigate?: () => void }> = ({ onNavigate }) => {
  const pathname = usePathname() || '';
  const { t, language } = useLanguage();
  const ar = language === 'ar';
  const visible = useVisibleNav();

  const isActive = (href: string) =>
    href === '/control-center' ? pathname === href : pathname === href || pathname.startsWith(href + '/');

  return (
    <nav className="flex flex-col gap-4">
      {ADMIN_GROUPS.map((group) => {
        const items = visible.filter((i) => i.group === group.key);
        if (items.length === 0) return null;
        return (
          <div key={group.key}>
            <p className="px-3 mb-1 text-[11px] font-bold uppercase tracking-wide text-ragab-ink-400">
              {ar ? group.labelAr : group.labelEn}
            </p>
            <ul className="space-y-0.5">
              {items.map((item: AdminNavItem) => {
                const active = isActive(item.href);
                const label = (t.admin as Record<string, string>)[item.labelKey];
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-3 h-10 text-body-sm font-semibold transition-colors',
                        active
                          ? 'bg-ragab-brand-500 text-ragab-ink-800'
                          : 'text-ragab-ink-300 hover:bg-white/5 hover:text-white'
                      )}
                    >
                      <item.icon className="w-[18px] h-[18px] shrink-0" />
                      <span className="truncate">{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
};

export default function ControlCenterLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const router = useRouter();
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const visible = useVisibleNav();

  const currentTitle = useMemo(() => {
    const match = [...visible]
      .sort((a, b) => b.href.length - a.href.length)
      .find((i) => (i.href === '/control-center' ? pathname === i.href : pathname.startsWith(i.href)));
    return match ? (t.admin as Record<string, string>)[match.labelKey] : t.admin.controlCenter;
  }, [pathname, visible, t]);

  return (
    <RequirePermission requireAdmin>
      <div className="min-h-[100dvh] flex bg-ragab-surface-sunken font-arabic">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-ragab-ink-900 text-white p-4 sticky top-0 h-[100dvh] overflow-y-auto">
          <Link href="/control-center" className="flex items-center gap-2 px-2 mb-6">
            <RagabLogo variant="mark" size="sm" theme="dark" />
            <span className="text-body font-extrabold">{t.admin.controlCenter}</span>
          </Link>
          <NavList />
          <div className="mt-auto pt-4">
            <Link
              href="/"
              className="flex items-center gap-2.5 rounded-lg px-3 h-10 text-body-sm font-semibold text-ragab-ink-300 hover:bg-white/5 hover:text-white transition-colors"
            >
              <Store className="w-[18px] h-[18px]" />
              {t.admin.backToStore}
            </Link>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Topbar */}
          <header className="sticky top-0 z-30 bg-ragab-surface/90 backdrop-blur border-b border-ragab-ink-200 h-16 flex items-center gap-3 px-4 sm:px-6">
            <button
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden touch-target flex items-center justify-center rounded-lg text-ragab-ink-600 hover:bg-ragab-ink-100 focus-ring"
              aria-label={t.common.menu}
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-h3 text-ragab-ink-800 font-bold truncate">{currentTitle}</h1>

            <div className="ms-auto flex items-center gap-2">
              <OrdersQuickAccessTrigger>
                {({ onClick, unreadCount, pendingOrders }) => (
                  <button
                    onClick={onClick}
                    className="relative items-center gap-2 rounded-lg px-3 h-9 text-caption font-semibold bg-white border border-ragab-ink-200 text-ragab-ink-700 hover:bg-ragab-ink-50 transition-colors shadow-sm hidden sm:inline-flex"
                  >
                    <OrdersIcon className="w-4 h-4" />
                    الطلبات
                    {pendingOrders.length > 0 && (
                      <span className="flex items-center gap-1">
                        <span className={cn("w-2 h-2 rounded-full", unreadCount > 0 ? "bg-ragab-danger animate-pulse" : "bg-ragab-ink-300")} />
                        {pendingOrders.length}
                      </span>
                    )}
                  </button>
                )}
              </OrdersQuickAccessTrigger>
              <Link
                href="/"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-caption font-semibold text-ragab-ink-600 hover:bg-ragab-ink-100 transition-colors"
              >
                <Store className="w-4 h-4" />
                {t.admin.backToStore}
              </Link>
              {user && (
                <DropdownMenu
                  trigger={
                    <span className="inline-flex items-center gap-1.5 rounded-full hover:bg-ragab-ink-100 p-1 pe-2 transition-colors">
                      <Avatar name={user.name} src={user.avatar} size="sm" />
                      <ChevronDown className="w-4 h-4 text-ragab-ink-400" />
                    </span>
                  }
                  items={[
                    { label: t.account.title, icon: <UserRound className="w-4 h-4" />, href: '/account' },
                    { label: t.admin.backToStore, icon: <Store className="w-4 h-4" />, href: '/' },
                    {
                      label: t.account.logout,
                      icon: <LogOut className="w-4 h-4" />,
                      destructive: true,
                      separatorBefore: true,
                      onClick: () => {
                        logout();
                        router.push('/');
                      },
                    },
                  ]}
                />
              )}
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto">{children}</main>
        </div>

        {/* Mobile drawer nav */}
        <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} title={t.admin.controlCenter} position="bottom" size="lg">
          <div className="[&_a]:text-ragab-ink-700 [&_a:hover]:bg-ragab-ink-100 [&_a:hover]:text-ragab-ink-900">
            <NavListLight onNavigate={() => setDrawerOpen(false)} />
            <Link
              href="/"
              onClick={() => setDrawerOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 h-11 text-body-sm font-semibold text-ragab-ink-700 hover:bg-ragab-ink-100 mt-2 border-t border-ragab-ink-100 pt-3"
            >
              <Store className="w-[18px] h-[18px]" />
              {t.admin.backToStore}
            </Link>
          </div>
        </Drawer>
      </div>
    </RequirePermission>
  );
}

/** Light-themed nav for the mobile bottom-sheet drawer (white background) */
const NavListLight: React.FC<{ onNavigate?: () => void }> = ({ onNavigate }) => {
  const pathname = usePathname() || '';
  const { t, language } = useLanguage();
  const ar = language === 'ar';
  const visible = useVisibleNav();
  const isActive = (href: string) =>
    href === '/control-center' ? pathname === href : pathname === href || pathname.startsWith(href + '/');

  return (
    <nav className="flex flex-col gap-3">
      {ADMIN_GROUPS.map((group) => {
        const items = visible.filter((i) => i.group === group.key);
        if (items.length === 0) return null;
        return (
          <div key={group.key}>
            <p className="px-3 mb-1 text-[11px] font-bold uppercase tracking-wide text-ragab-ink-400">
              {ar ? group.labelAr : group.labelEn}
            </p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = isActive(item.href);
                const label = (t.admin as Record<string, string>)[item.labelKey];
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-3 h-11 text-body-sm font-semibold transition-colors',
                        active ? 'bg-ragab-cream text-ragab-ink-800 border border-ragab-brand-200' : 'text-ragab-ink-700 hover:bg-ragab-ink-100'
                      )}
                    >
                      <item.icon className="w-[18px] h-[18px] shrink-0" />
                      <span className="truncate">{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
};
