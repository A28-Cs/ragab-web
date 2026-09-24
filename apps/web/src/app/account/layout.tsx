'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  User as UserIcon,
  ShoppingBag,
  MapPin,
  Heart,
  Bell,
  ShieldCheck,
  Settings,
  LogOut,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@ragab/utils';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Avatar } from '../../components/ui/Avatar';
import { StatusPill } from '../../components/ui/StatusPill';
import { AuthStatePanel } from '../../components/auth/AuthStatePanel';
import { Loader2 } from 'lucide-react';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const { t } = useLanguage();
  const { user, isLoggedIn, authReady, logout, hasAnyAdminAccess } = useAuth();

  const nav = [
    { href: '/account', label: t.account.overview, icon: LayoutGrid, exact: true },
    { href: '/account/profile', label: t.account.profile, icon: UserIcon },
    { href: '/account/orders', label: t.account.myOrders, icon: ShoppingBag },
    { href: '/account/addresses', label: t.account.myAddresses, icon: MapPin },
    { href: '/favorites', label: t.account.favorites, icon: Heart },
    { href: '/account/notifications', label: t.account.notifications, icon: Bell },
    { href: '/account/security', label: t.account.security, icon: ShieldCheck },
    { href: '/account/settings', label: t.account.settings, icon: Settings },
  ];

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');

  if (!authReady) {
    return (
      <div className="flex items-center justify-center py-24" aria-busy>
        <Loader2 className="w-7 h-7 animate-spin text-ragab-ink-400" />
      </div>
    );
  }

  if (!isLoggedIn || !user) {
    return <AuthStatePanel variant="unauthorized" />;
  }

  return (
    <div className="font-arabic">
      <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6">
        {/* Sidebar / profile */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          {/* Profile summary */}
          <div className="bg-ragab-surface rounded-xl border border-ragab-ink-200 shadow-subtle p-4 flex items-center gap-3 mb-4">
            <Avatar name={user.name} src={user.avatar} size="lg" />
            <div className="min-w-0">
              <p className="text-body font-bold text-ragab-ink-800 truncate">{user.name}</p>
              <p className="text-caption text-ragab-ink-500 truncate" dir="ltr">
                {user.phone}
              </p>
              <div className="mt-1.5">
                <StatusPill tone="success">{t.account.statusActive}</StatusPill>
              </div>
            </div>
          </div>

          {/* Mobile: horizontal scroll nav */}
          <nav className="lg:hidden -mx-4 px-4 mb-5">
            <div className="scroll-rail pb-1">
              {nav.map((item) => {
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3.5 h-10 text-body-sm font-semibold whitespace-nowrap transition-colors',
                      active
                        ? 'bg-ragab-brand-500 border-ragab-brand-500 text-ragab-ink-800'
                        : 'bg-white border-ragab-ink-200 text-ragab-ink-600'
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Desktop: vertical nav */}
          <nav className="hidden lg:flex lg:flex-col gap-1 bg-ragab-surface rounded-xl border border-ragab-ink-200 shadow-subtle p-2">
            {nav.map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-3 h-11 text-body-sm font-semibold transition-colors',
                    active
                      ? 'bg-ragab-cream text-ragab-ink-800 border border-ragab-brand-200'
                      : 'text-ragab-ink-600 hover:bg-ragab-ink-50 border border-transparent'
                  )}
                >
                  <item.icon className={cn('w-[18px] h-[18px]', active ? 'text-ragab-brand-700' : 'text-ragab-ink-400')} />
                  {item.label}
                </Link>
              );
            })}
            {hasAnyAdminAccess && (
              <Link
                href="/control-center"
                className="flex items-center gap-2.5 rounded-lg px-3 h-11 text-body-sm font-semibold text-ragab-ink-700 hover:bg-ragab-ink-50 border-t border-ragab-ink-100 mt-1 pt-1"
              >
                <ShieldAlert className="w-[18px] h-[18px] text-ragab-info" />
                {t.admin.controlCenter}
              </Link>
            )}
            <button
              onClick={logout}
              className="flex items-center gap-2.5 rounded-lg px-3 h-11 text-body-sm font-semibold text-ragab-danger hover:bg-ragab-danger-soft transition-colors text-start"
            >
              <LogOut className="w-[18px] h-[18px]" />
              {t.account.logout}
            </button>
          </nav>
        </aside>

        {/* Content */}
        <section className="min-w-0 mt-2 lg:mt-0">{children}</section>
      </div>
    </div>
  );
}
