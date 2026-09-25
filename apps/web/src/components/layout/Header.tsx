'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import {
  Plus,
  Search,
  ShoppingBag,
  Heart,
  User,
  Globe,
  Menu,
  MapPin,
  ChevronDown,
  ShoppingBag as OrdersIcon,
  ShieldCheck,
  Settings,
  LogOut,
  ShieldAlert,
  Grid2X2,
} from 'lucide-react';
import { cn } from '@ragab/utils';
import { RagabLogo } from '../ui/RagabLogo';
import { Drawer } from '../ui/Drawer';
import { Avatar } from '../ui/Avatar';
import { DropdownMenu } from '../ui/DropdownMenu';
import { useLanguage } from '../../context/LanguageContext';
import { useCart } from '../../context/CartContext';
import { useFavorites } from '../../context/FavoritesContext';
import { useAuth } from '../../context/AuthContext';
import { getProducts } from '../../services/productService';
import { getCategories } from '../../services/categoryService';
import { Product, Category } from '../../types';
import { MegaMenu } from './MegaMenu';
import { SearchOverlay, saveRecentSearch } from './SearchOverlay';
import { featuredCategories } from '../../lib/categoryPresentation';
import { CreateProductModal } from '../product/CreateProductModal';
import { OrdersQuickAccessPopup } from '../admin/OrdersQuickAccess';
import { useOrderEvents } from '../../context/OrderEventsContext';

const iconBtn =
  'inline-flex items-center justify-center w-11 h-11 rounded-lg text-ragab-ink-800 hover:bg-ragab-ink-50 transition-colors focus-ring';

export const Header: React.FC = () => {
  const { t, toggleLanguage, isRTL } = useLanguage();
  const { totalItems, toggleCart } = useCart();
  const { favorites } = useFavorites();
  const { user, isLoggedIn, logout, hasAnyAdminAccess, hasPermission } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const canAddProduct =
    Boolean(hasAnyAdminAccess) &&
    (user?.roleId === 'role_owner' ||
      user?.roleId === 'role_store_manager' ||
      user?.roleId === 'role_product_manager' ||
      hasPermission('products', 'create') ||
      hasPermission('products', 'manage'));

  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isOrdersOpen, setIsOrdersOpen] = useState(false);
  const { unreadCount, pendingOrders } = useOrderEvents();
  const canManageOrders = hasPermission('orders', 'view');
  const [categories, setCategories] = useState<Category[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const measure = () => document.documentElement.style.setProperty('--header-h', header.getBoundingClientRect().height + 'px');
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--header-h'); };
  }, []);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  const navCategories = useMemo(() => featuredCategories(categories, 8), [categories]);
  const topLevel = useMemo(() => categories.filter((c) => !c.parentId), [categories]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      let alive = true;
      getProducts({ searchQuery }).then((res) => {
        if (!alive) return;
        setSuggestions(res.slice(0, 5));
        setShowSuggestions(true);
      }).catch(() => { if (alive) setSuggestions([]); });
      return () => {
        alive = false;
      };
    }
    setSuggestions([]);
    setShowSuggestions(false);
  }, [searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      saveRecentSearch(q);
      setShowSuggestions(false);
      router.push(`/search?q=${encodeURIComponent(q)}`);
    }
  };

  const [logoutError, setLogoutError] = useState(false);
  const handleLogout = async () => {
    setLogoutError(false);
    try {
      await logout();
      setIsMenuOpen(false);
      router.push('/');
    } catch { setLogoutError(true); }
  };

  const accountMenu = isLoggedIn ? (
    <DropdownMenu
      align="end"
      trigger={
        <span className="inline-flex items-center gap-0 sm:gap-2 h-11 px-1 sm:ps-1.5 sm:pe-3 rounded-lg hover:bg-ragab-ink-50 transition-colors font-arabic">
          <Avatar name={user?.name ?? ''} src={user?.avatar} size="sm" />
          <span className="hidden sm:block text-body-sm font-bold text-ragab-ink-800 max-w-[90px] truncate">
            {user?.name.split(' ')[0]}
          </span>
          <ChevronDown className="hidden sm:block w-4 h-4 text-ragab-ink-400" />
        </span>
      }
      items={[
        { label: t.navigation.account, icon: <User className="w-4 h-4" />, href: '/account' },
        { label: t.navigation.orders, icon: <OrdersIcon className="w-4 h-4" />, href: '/account/orders' },
        { label: isRTL ? 'العناوين' : 'Addresses', icon: <MapPin className="w-4 h-4" />, href: '/account/addresses' },
        { label: t.account.security, icon: <ShieldCheck className="w-4 h-4" />, href: '/account/security' },
        { label: t.account.settings, icon: <Settings className="w-4 h-4" />, href: '/account/settings' },
        ...(hasAnyAdminAccess
          ? [{ label: t.admin.controlCenter, icon: <ShieldAlert className="w-4 h-4" />, href: '/control-center', separatorBefore: true }]
          : []),
        {
          label: t.navigation.languageToggle,
          icon: <Globe className="w-4 h-4" />,
          separatorBefore: !hasAnyAdminAccess,
          onClick: toggleLanguage,
        },
        {
          label: t.navigation.logout,
          icon: <LogOut className="w-4 h-4" />,
          destructive: true,
          onClick: handleLogout,
        },
      ]}
    />
  ) : (
    <Link href="/login" className="inline-flex items-center gap-2 h-11 px-2 text-body-sm font-bold text-ragab-ink-800 focus-ring rounded-lg hover:bg-ragab-ink-50 whitespace-nowrap" aria-label={t.navigation.login} title={t.navigation.login}>
      <User className="w-5 h-5" />
      <span>{t.navigation.login}</span>
    </Link>
  );

  return (
    <header ref={headerRef} className="sticky top-0 z-40 bg-white border-b border-ragab-ink-200">
      <div className="container-page">
        {/* ===== Main bar ===== */}
        <div className="flex items-center gap-2 xl:gap-6 h-[72px] lg:h-[88px]">
          {/* Mobile: menu button */}
          <button
            onClick={() => setIsMenuOpen(true)}
            className="lg:hidden touch-target flex items-center justify-center text-ragab-ink-800 hover:bg-ragab-ink-100 rounded-xl focus-ring -ms-2"
            aria-label={t.common.menu}
          >
            <Menu className="w-6 h-6" />
          </button>

          {/* Logo */}
          <Link href="/" className="flex-shrink-0 focus-ring rounded-xl" aria-label={t.common.storeName}>
            <RagabLogo size="sm" className="lg:hidden" /><RagabLogo size="md" className="hidden lg:inline-flex" />
          </Link>

          {/* Desktop search — pill */}
          <div ref={searchRef} className="relative flex-1 min-w-0 hidden lg:block mx-auto max-w-3xl">
            <form onSubmit={handleSearchSubmit} className="relative">
              <Search className="absolute start-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ragab-ink-500 pointer-events-none" />
              <input
                aria-label={t.common.searchPlaceholder}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchQuery.trim().length >= 2 && setShowSuggestions(true)}
                placeholder={t.common.searchPlaceholder}
                className="w-full h-12 ps-12 pe-4 bg-ragab-ink-50 border border-ragab-ink-200 hover:border-ragab-ink-300 focus:border-ragab-brand-500 rounded-lg text-body-sm text-ragab-ink-800 placeholder-ragab-ink-500 focus:outline-none focus:ring-4 focus:ring-ragab-brand-500/20 transition-all font-arabic"
              />
            </form>

            {/* Suggestions */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full inset-x-0 mt-2 bg-white rounded-2xl shadow-popover border border-ragab-ink-200 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="divide-y divide-ragab-ink-100">
                  {suggestions.map((item) => (
                    <Link
                      key={item.id}
                      href={`/product/${item.slug}`}
                      onClick={() => setShowSuggestions(false)}
                      className="flex items-center gap-3 p-3 hover:bg-ragab-cream-soft transition-colors"
                    >
                      <span className="w-11 h-11 rounded-xl bg-ragab-surface-sunken shrink-0 relative overflow-hidden">
                        <Image src={item.image} alt="" fill sizes="44px" className="object-contain p-1" />
                      </span>
                      <span className="flex-1 min-w-0 font-arabic">
                        <span className="block text-body-sm font-bold text-ragab-ink-800 truncate">
                          {isRTL ? item.nameAr : item.nameEn || item.nameAr}
                        </span>
                        <span className="block text-caption text-ragab-ink-500">
                          {item.price.toFixed(2)} {t.common.egp} • {isRTL ? item.unitAr : item.unitEn}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 lg:hidden" />

          {/* Actions */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <div className="sm:hidden">{isLoggedIn ? accountMenu : <Link href="/login" aria-label={t.navigation.login} className="w-10 h-11 flex flex-col items-center justify-center text-ragab-ink-800 rounded-lg focus-ring"><User className="w-4 h-4" /><span className="text-[10px] font-bold mt-0.5">{isRTL ? 'دخول' : 'Sign in'}</span></Link>}</div>
            {/* If General Manager, Store Manager, or Product Manager: replace delivery area with "إضافة منتج" */}
            {canAddProduct ? (
              <button
                type="button"
                onClick={() => setIsAddProductOpen(true)}
                title={isRTL ? 'إضافة منتج جديد' : 'Add new product'}
                className="hidden 2xl:inline-flex items-center gap-2 h-11 px-4 rounded-lg bg-ragab-brand-500 hover:bg-ragab-brand-600 text-ragab-ink-900 font-bold text-body-sm font-arabic transition-all shadow-subtle hover:shadow-md focus-ring active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>{isRTL ? 'إضافة منتج' : 'Add product'}</span>
              </button>
            ) : (
              /* Delivery area — desktop only for customers and guests */
              <span className="hidden 2xl:inline-flex items-center gap-2 h-11 px-3 font-arabic">
                <MapPin className="w-4 h-4 text-ragab-brand-700 shrink-0" />
                <span className="flex flex-col leading-tight">
                  <span className="text-[11px] text-ragab-ink-500 font-semibold">{t.common.deliveryArea}</span>
                  <span className="text-caption font-bold text-ragab-ink-800">{t.common.deliveryAreaShort}</span>
                </span>
              </span>
            )}

            {/* Language (desktop, guests) */}
            {!isLoggedIn && (
              <button
                onClick={toggleLanguage}
                className="hidden lg:inline-flex items-center gap-1.5 h-11 px-2 rounded-lg hover:bg-ragab-ink-50 text-caption font-bold text-ragab-ink-800 transition-colors font-english focus-ring"
                title="Switch Language"
              >
                <Globe className="w-4 h-4 text-ragab-ink-600" />
                <span>{t.navigation.languageToggle}</span>
              </button>
            )}

            <div className="hidden lg:block">{accountMenu}</div>

            {/* Orders Quick Access */}
            {canManageOrders && (
              <button
                type="button"
                onClick={() => setIsOrdersOpen(true)}
                className={cn(iconBtn, 'hidden sm:inline-flex relative')}
                aria-label="الطلبات"
                title="الطلبات"
              >
                <OrdersIcon className="w-5 h-5" />
                {pendingOrders.length > 0 && (
                  <span className={cn(
                    "absolute -top-1 -end-1 text-white text-[10px] font-extrabold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center border-2 border-white",
                    unreadCount > 0 ? "bg-ragab-danger animate-pulse" : "bg-ragab-ink-500"
                  )}>
                    {pendingOrders.length > 99 ? '99+' : pendingOrders.length}
                  </span>
                )}
              </button>
            )}

            {/* Favorites */}
            <Link
              href="/favorites"
              className={cn(iconBtn, 'hidden sm:inline-flex relative')}
              aria-label={t.navigation.favorites}
              title={t.navigation.favorites}
            >
              <Heart className="w-5 h-5" />
              {favorites.length > 0 && (
                <span className="absolute -top-1 -end-1 bg-ragab-danger text-white text-[10px] font-extrabold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center border-2 border-white">
                  {favorites.length > 99 ? '99+' : favorites.length}
                </span>
              )}
            </Link>

            {/* Cart */}
            <button
              type="button"
              onClick={toggleCart}
              aria-label={t.navigation.cart}
              className="relative inline-flex items-center gap-2 h-11 px-3 sm:px-4 rounded-lg bg-ragab-brand-700 hover:bg-ragab-brand-800 text-white font-bold text-body-sm font-arabic transition-colors focus-ring shadow-subtle"
            >
              <ShoppingBag className="w-5 h-5" />
              <span className="hidden sm:inline">{t.navigation.cart}</span>
              {totalItems > 0 && (
                <span
                  aria-live="polite"
                  className="absolute -top-1.5 -end-1.5 bg-ragab-ink-800 text-white text-[10px] font-extrabold min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center border-2 border-white"
                >
                  {totalItems > 99 ? '99+' : totalItems}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ===== Mobile search (opens the overlay) ===== */}
        <div className="lg:hidden flex items-center gap-3 pb-3">
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            className="min-w-0 flex-1 h-11 ps-11 pe-3 relative bg-ragab-ink-50 border border-ragab-ink-200 rounded-lg text-body-sm text-ragab-ink-500 text-start font-arabic focus-ring shadow-subtle"
          >
            <Search className="absolute start-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ragab-ink-500" />
            <span className="block truncate">{t.common.searchPlaceholder}</span>
          </button>
          <div className="hidden sm:block shrink-0">{accountMenu}</div>
        </div>

        {/* ===== Category navigation row (desktop lg+) ===== */}
        <nav
          aria-label={t.navigation.categories}
          className="hidden lg:flex items-center gap-1 h-12 border-t border-ragab-ink-100 font-arabic"
        >
          <div className="me-2 shrink-0">
            <MegaMenu />
          </div>
          <div className="flex items-center min-w-0 overflow-x-auto flex-1">
          {navCategories.map((c) => {
            const href = `/category/${c.slug}`;
            const active = pathname === href;
            return (
              <Link
                key={c.id}
                href={href}
                className={cn(
                  'px-3 h-10 inline-flex items-center rounded-xl text-body-sm font-bold transition-colors focus-ring whitespace-nowrap',
                  active
                    ? 'bg-ragab-brand-500 text-white'
                    : 'text-ragab-ink-700 hover:text-ragab-ink-900 hover:bg-ragab-ink-50'
                )}
              >
                {isRTL ? c.nameAr : c.nameEn}
              </Link>
            );
          })}
          </div>
          {canAddProduct && <button type="button" onClick={() => setIsAddProductOpen(true)} className="2xl:hidden shrink-0 inline-flex items-center gap-2 min-h-10 px-3 rounded-lg text-body-sm font-bold text-ragab-brand-800 hover:bg-ragab-brand-50 focus-ring"><Plus className="w-4 h-4" />{isRTL ? 'إضافة منتج' : 'Add product'}</button>}
        </nav>

        {/* ===== Category rail (tablet md-lg) ===== */}
        <div className="hidden md:block lg:hidden pb-3">
          <div className="scroll-rail">
            {navCategories.map((c) => {
              const active = pathname === `/category/${c.slug}`;
              return (
                <Link
                  key={c.id}
                  href={`/category/${c.slug}`}
                  className={cn(
                    'shrink-0 h-9 px-3.5 inline-flex items-center gap-1.5 rounded-lg border text-body-sm font-bold font-arabic transition-colors focus-ring',
                    active 
                      ? 'bg-ragab-brand-500 border-ragab-brand-500 text-white' 
                      : 'bg-white hover:bg-ragab-cream-soft border-ragab-ink-200 hover:border-ragab-brand-300 text-ragab-ink-700'
                  )}
                >
                  <Grid2X2 className="w-4 h-4" aria-hidden="true" />
                  {isRTL ? c.nameAr : c.nameEn}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {logoutError && <p role="alert" className="container-page py-2 text-body-sm text-ragab-danger">{isRTL ? 'تعذر تأكيد تسجيل الخروج. تحقق من الاتصال وحاول مجدداً.' : 'Could not confirm sign-out. Check your connection and try again.'}</p>}
      {/* ===== Mobile menu drawer ===== */}
      <Drawer
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        title={t.common.menu}
        size="sm"
        position={isRTL ? 'right' : 'left'}
      >
        <nav className="font-arabic space-y-1">
          <section className="mb-5 p-4 rounded-xl bg-ragab-brand-50 border border-ragab-brand-200" aria-label={t.navigation.account}>
            <div className="flex items-center gap-3 mb-3">
              {isLoggedIn ? <Avatar name={user?.name ?? ''} src={user?.avatar} size="sm" /> : <User className="w-6 h-6 text-ragab-brand-700" />}
              <div className="min-w-0">
                <p className="font-bold truncate">{isLoggedIn ? user?.name : isRTL ? 'مرحباً بك في صيدلية رجب' : 'Welcome to Ragab Pharmacy'}</p>
                <p className="text-caption text-ragab-ink-600">{isRTL ? 'كل ما تحتاجه لصحتك، في مكان واحد' : 'Your health essentials, in one place'}</p>
              </div>
            </div>
            {isLoggedIn ? <>
              <div className="grid grid-cols-2 gap-2 text-body-sm">
                {[{ href: '/account', label: t.navigation.account }, { href: '/account/orders', label: t.navigation.orders }, { href: '/account/addresses', label: isRTL ? 'العناوين' : 'Addresses' }, { href: '/account/settings', label: t.account.settings }].map(item => <Link key={item.href} href={item.href} onClick={() => setIsMenuOpen(false)} className="p-2 hover:bg-white rounded-lg focus-ring">{item.label}</Link>)}
              </div>
              <button onClick={handleLogout} className="mt-3 pt-3 border-t border-ragab-brand-200 w-full flex items-center gap-2 text-ragab-danger text-body-sm font-bold focus-ring"><LogOut className="w-4 h-4" />{t.navigation.logout}</button>
            </> : <>
              <p className="text-caption text-ragab-ink-600 mb-3">{isRTL ? 'سجل الدخول لمتابعة طلباتك' : 'Sign in to follow your orders'}</p>
              <Link href="/login" onClick={() => setIsMenuOpen(false)} className="flex items-center justify-center gap-2 min-h-11 rounded-lg bg-ragab-brand-700 text-white font-bold focus-ring"><User className="w-4 h-4" />{t.navigation.login}</Link>
            </>}
          </section>
          {[
            { href: '/', label: t.navigation.home },
            { href: '/offers', label: t.navigation.offers },
            { href: '/categories?sort=popular', label: t.navigation.bestSellers },
            { href: '/favorites', label: t.navigation.favorites },
            ...(hasAnyAdminAccess ? [{ href: '/control-center', label: t.admin.controlCenter }] : []),
            { href: '/about', label: t.navigation.about },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsMenuOpen(false)}
              className="block py-3 px-3 rounded-xl text-body-sm font-bold text-ragab-ink-800 hover:bg-ragab-cream-soft transition-colors"
            >
              {item.label}
            </Link>
          ))}

          {canAddProduct && (
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                setIsAddProductOpen(true);
              }}
              className="flex items-center gap-2 py-3 px-3 rounded-xl text-body-sm font-bold text-ragab-ink-900 bg-ragab-brand-50 hover:bg-ragab-brand-100 transition-colors w-full text-start"
            >
              <Plus className="w-4 h-4 text-ragab-brand-700" />
              <span>{isRTL ? 'إضافة منتج' : 'Add product'}</span>
            </button>
          )}

          {canManageOrders && (
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                setIsOrdersOpen(true);
              }}
              className="flex items-center gap-2 py-3 px-3 rounded-xl text-body-sm font-bold text-ragab-ink-800 hover:bg-ragab-cream-soft transition-colors w-full text-start"
            >
              <div className="relative">
                <OrdersIcon className="w-4 h-4 text-ragab-ink-600" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-ragab-danger border border-white" />
                )}
              </div>
              <span>الطلبات ({pendingOrders.length})</span>
            </button>
          )}

          <div className="pt-3 mt-2 border-t border-ragab-ink-100">
            <h4 className="text-label text-ragab-ink-500 px-3 mb-1">{t.common.allDepartments}</h4>
            {topLevel.map((c) => (
              <Link
                key={c.id}
                href={`/category/${c.slug}`}
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-2.5 py-2.5 px-3 rounded-xl text-body-sm font-semibold text-ragab-ink-700 hover:bg-ragab-cream-soft transition-colors"
              >
                <span aria-hidden="true" className="text-base leading-none">
                  <Grid2X2 className="w-4 h-4" />
                </span>
                {isRTL ? c.nameAr : c.nameEn}
              </Link>
            ))}
          </div>

          <div className="pt-3 mt-2 border-t border-ragab-ink-100">
            <button
              onClick={() => {
                toggleLanguage();
                setIsMenuOpen(false);
              }}
              className="flex items-center gap-2 py-3 px-3 rounded-xl text-body-sm font-bold text-ragab-ink-800 hover:bg-ragab-cream-soft transition-colors w-full font-english"
            >
              <Globe className="w-4 h-4 text-ragab-brand-700" />
              {t.navigation.languageToggle}
            </button>
          </div>
        </nav>
      </Drawer>

      {/* ===== Mobile search overlay ===== */}
      <SearchOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      {/* ===== Create Product Modal (Popup without leaving page) ===== */}
      {canAddProduct && (
        <CreateProductModal
          isOpen={isAddProductOpen}
          onClose={() => setIsAddProductOpen(false)}
        />
      )}

      {canManageOrders && (
        <OrdersQuickAccessPopup isOpen={isOrdersOpen} onClose={() => setIsOrdersOpen(false)} />
      )}
    </header>
  );
};
