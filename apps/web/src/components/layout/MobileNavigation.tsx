'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LayoutGrid, Tag, ShoppingBag, User } from 'lucide-react';
import { cn } from '@ragab/utils';
import { useLanguage } from '../../context/LanguageContext';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';

export const MobileNavigation: React.FC = () => {
  const { t } = useLanguage();
  const { totalItems, toggleCart } = useCart();
  const { isLoggedIn } = useAuth();
  const pathname = usePathname();
  const [isModalActive, setIsModalActive] = useState(false);

  useEffect(() => {
    const checkModalState = () => {
      if (typeof document === 'undefined') return;
      const isBodyLocked =
        document.body.style.overflow === 'hidden' ||
        document.body.classList.contains('has-modal-open');
      const hasModalElement = !!document.querySelector(
        '[role="dialog"], [role="alertdialog"], [aria-modal="true"], [data-modal-open="true"]'
      );
      const active = isBodyLocked || hasModalElement;
      setIsModalActive((prev) => (prev !== active ? active : prev));
    };

    checkModalState();

    const observer = new MutationObserver(() => {
      checkModalState();
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-modal-open'],
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  const navItems = [
    { href: '/', label: t.navigation.home, icon: Home, exact: true },
    { href: '/categories', label: t.navigation.categories, icon: LayoutGrid, exact: false },
    { href: '/offers', label: t.navigation.offers, icon: Tag, exact: false },
    { action: toggleCart, label: t.navigation.cart, icon: ShoppingBag, badge: totalItems },
    { href: isLoggedIn ? '/account' : '/login', label: t.navigation.account, icon: User, exact: false },
  ];

  return (
    <nav
      aria-label={t.common.menu}
      aria-hidden={isModalActive ? 'true' : undefined}
      className={cn(
        'mobile-bottom-nav md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-ragab-ink-200 shadow-sticky select-none pb-[env(safe-area-inset-bottom)] transition-all duration-200 ease-in-out',
        isModalActive && 'translate-y-full opacity-0 pointer-events-none -z-10 invisible'
      )}
      style={{ height: 'calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))' }}
    >
      <div className="grid grid-cols-5 items-stretch h-[var(--bottom-nav-h)]">
        {navItems.map((item, idx) => {
          const Icon = item.icon;
          const isActive = item.href
            ? item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href)
            : false;

          const content = (
            <span className="relative flex flex-col items-center justify-center gap-1 h-full">
              {isActive && (
                <span className="absolute top-0 inset-x-5 h-0.5 rounded-b-full bg-ragab-brand-500" />
              )}
              <span className="relative">
                <Icon
                  className={cn(
                    'w-[22px] h-[22px]',
                    isActive ? 'text-ragab-ink-900' : 'text-ragab-ink-500'
                  )}
                  strokeWidth={isActive ? 2.4 : 1.9}
                />
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    aria-live="polite"
                    className="absolute -top-1.5 -end-2 bg-ragab-danger text-white text-[10px] leading-none font-extrabold min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center border border-white shadow-subtle"
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'text-caption font-bold font-arabic tracking-tight',
                  isActive ? 'text-ragab-ink-900' : 'text-ragab-ink-500'
                )}
              >
                {item.label}
              </span>
            </span>
          );

          if (item.action) {
            return (
              <button
                key={idx}
                type="button"
                onClick={item.action}
                aria-label={item.label}
                className="w-full h-full focus-ring"
              >
                {content}
              </button>
            );
          }

          return (
            <Link
              key={idx}
              href={item.href || '/'}
              aria-current={isActive ? 'page' : undefined}
              className="w-full h-full focus-ring"
            >
              {content}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
