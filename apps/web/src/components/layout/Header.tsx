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
  FileText,
  Headphones,
  Home,
  Pill,
  Tag,
  Flame,
  HelpCircle,
  Info,
  Sparkles,
  Baby,
  HeartPulse,
  Package,
  Scissors,
  LayoutGrid,
  LayoutDashboard,
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
import { featuredCategories, categoryEmoji } from '../../lib/categoryPresentation';
import { CreateProductModal } from '../product/CreateProductModal';
import { OrdersQuickAccessPopup } from '../admin/OrdersQuickAccess';
import { useOrderEvents } from '../../context/OrderEventsContext';

function CategorySvgIcon({ iconName, className = 'w-4 h-4' }: { iconName?: string; className?: string }) {
  switch (iconName) {
    case 'pill':
      return <Pill className={className} />;
    case 'sparkles':
    case 'spray-can':
      return <Sparkles className={className} />;
    case 'baby':
      return <Baby className={className} />;
    case 'heart-pulse':
    case 'activity':
      return <HeartPulse className={className} />;
    case 'heart':
      return <Heart className={className} />;
    case 'scissors':
      return <Scissors className={className} />;
    case 'package':
      return <Package className={className} />;
    case 'shopping-bag':
    case 'shopping-basket':
      return <ShoppingBag className={className} />;
    default:
      return <LayoutGrid className={className} />;
  }
}

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
        { label: isRTL ? 'الدعم والمساعدة' : 'Help & Support', icon: <Headphones className="w-4 h-4" />, href: '/contact' },
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
                  <Link
                    href={`/request-product?name=${encodeURIComponent(searchQuery)}`}
                    onClick={() => setShowSuggestions(false)}
                    className="flex items-center justify-between p-3 bg-ragab-brand-50/60 hover:bg-ragab-brand-50 text-caption font-bold text-ragab-brand-800 transition-colors"
                  >
                    <span>{isRTL ? 'مش لاقي طلبك في النتائج؟ اطلب توفيره فوراً' : "Can't find what you need? Request it here"}</span>
                    <span className="underline underline-offset-4">{isRTL ? 'طلب توفير دواء' : 'Request Product'}</span>
                  </Link>
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

            {/* Prescription Order Button */}
            <Link
              href="/prescription"
              className="inline-flex items-center gap-1.5 h-11 px-3 sm:px-3.5 rounded-lg border border-ragab-brand-300 bg-ragab-brand-50 hover:bg-ragab-brand-100 text-ragab-brand-800 font-bold text-caption sm:text-body-sm font-arabic transition-all focus-ring shadow-subtle shrink-0"
              title={isRTL ? 'اطلب بروشتة' : 'Order by Prescription'}
            >
              <FileText className="w-4 h-4 text-ragab-brand-700" />
              <span className="whitespace-nowrap">{isRTL ? 'اطلب بروشتة' : 'Prescription'}</span>
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
        <nav className="font-arabic space-y-4 pb-8">
          {/* 1. Account / Login Section */}
          <section className="p-3.5 rounded-2xl bg-gradient-to-br from-ragab-brand-50 to-teal-50/40 border border-ragab-brand-200/80 shadow-xs" aria-label={t.navigation.account}>
            <div className="flex items-center gap-3">
              {isLoggedIn ? (
                <Avatar name={user?.name ?? ''} src={user?.avatar} size="md" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-ragab-brand-100 flex items-center justify-center text-ragab-brand-700 shrink-0">
                  <User className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-ragab-ink-900 truncate text-body-sm">
                  {isLoggedIn ? user?.name : (isRTL ? 'مرحباً بك في صيدلية رجب' : 'Welcome to Ragab Pharmacy')}
                </p>
                <p className="text-caption text-ragab-ink-500 truncate">
                  {isLoggedIn ? (user?.phone || user?.email) : (isRTL ? 'سجل دخولك لمتابعة طلباتك وصحتك' : 'Sign in to manage your health')}
                </p>
              </div>
            </div>

            {isLoggedIn ? (
              <div className="mt-3 pt-3 border-t border-ragab-brand-200/60 grid grid-cols-2 gap-1.5 text-caption font-semibold">
                <Link
                  href="/account/orders"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-2 p-2 rounded-lg bg-white/80 hover:bg-white text-ragab-ink-800 transition-colors shadow-2xs"
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-ragab-brand-600 shrink-0" />
                  <span>{t.navigation.orders}</span>
                </Link>
                <Link
                  href="/account/addresses"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-2 p-2 rounded-lg bg-white/80 hover:bg-white text-ragab-ink-800 transition-colors shadow-2xs"
                >
                  <MapPin className="w-3.5 h-3.5 text-ragab-brand-600 shrink-0" />
                  <span>{isRTL ? 'عناويني' : 'Addresses'}</span>
                </Link>
                <Link
                  href="/account"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-2 p-2 rounded-lg bg-white/80 hover:bg-white text-ragab-ink-800 transition-colors shadow-2xs"
                >
                  <User className="w-3.5 h-3.5 text-ragab-brand-600 shrink-0" />
                  <span>{t.navigation.account}</span>
                </Link>
                <Link
                  href="/account/settings"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-2 p-2 rounded-lg bg-white/80 hover:bg-white text-ragab-ink-800 transition-colors shadow-2xs"
                >
                  <Settings className="w-3.5 h-3.5 text-ragab-brand-600 shrink-0" />
                  <span>{t.account.settings}</span>
                </Link>
              </div>
            ) : (
              <div className="mt-3">
                <Link
                  href="/login"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center justify-center gap-2 h-10 rounded-xl bg-ragab-brand-700 hover:bg-ragab-brand-800 text-white font-bold text-body-sm shadow-sm transition-colors"
                >
                  <User className="w-4 h-4" />
                  <span>{t.navigation.login}</span>
                </Link>
              </div>
            )}
          </section>

          {/* 2. Admin & Staff Controls (إدارة الصيدلية - لوحة الإدارة) */}
          {hasAnyAdminAccess && (
            <section className="p-2.5 rounded-2xl bg-ragab-ink-900 text-white shadow-sm space-y-1">
              <p className="px-2 pt-1 pb-0.5 text-[11px] font-bold uppercase tracking-wider text-ragab-brand-300">
                {isRTL ? 'إدارة الصيدلية' : 'Staff Management'}
              </p>
              
              <Link
                href="/control-center"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-body-sm font-bold text-white hover:bg-white/10 transition-colors"
              >
                <LayoutDashboard className="w-4 h-4 text-ragab-brand-400 shrink-0" />
                <span className="flex-1">{t.admin.controlCenter}</span>
              </Link>

              {canManageOrders && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsOrdersOpen(true);
                  }}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl text-body-sm font-bold text-white hover:bg-white/10 transition-colors w-full text-start"
                >
                  <div className="relative shrink-0">
                    <OrdersIcon className="w-4 h-4 text-ragab-brand-400" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-ragab-danger animate-pulse" />
                    )}
                  </div>
                  <span className="flex-1">{isRTL ? 'الطلبات الواردة' : 'Incoming Orders'}</span>
                  {pendingOrders.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-ragab-brand-500 text-ragab-ink-900">
                      {pendingOrders.length}
                    </span>
                  )}
                </button>
              )}

              {canAddProduct && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsAddProductOpen(true);
                  }}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl text-body-sm font-bold text-white hover:bg-white/10 transition-colors w-full text-start"
                >
                  <Plus className="w-4 h-4 text-ragab-brand-400 shrink-0" />
                  <span className="flex-1">{isRTL ? 'إضافة منتج جديد' : 'Add New Product'}</span>
                </button>
              )}
            </section>
          )}

          {/* 3. Core Pharmacy Services (الخدمات الصيدلانية الأساسية) */}
          <div className="space-y-1">
            <p className="px-3 pt-1 pb-1 text-[11px] font-bold uppercase tracking-wider text-ragab-ink-400">
              {isRTL ? 'خدمات الصيدلية' : 'Pharmacy Services'}
            </p>

            <Link
              href="/"
              onClick={() => setIsMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-body-sm font-bold text-ragab-ink-800 hover:bg-ragab-ink-50 transition-colors"
            >
              <Home className="w-4 h-4 text-ragab-brand-600 shrink-0" />
              <span>{t.navigation.home}</span>
            </Link>

            <Link
              href="/prescription"
              onClick={() => setIsMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-body-sm font-bold text-ragab-ink-800 hover:bg-amber-50/70 transition-colors"
            >
              <FileText className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="flex-1">{isRTL ? 'اطلب بروشتة' : 'Order by Prescription'}</span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800">
                {isRTL ? 'فوري' : 'Fast'}
              </span>
            </Link>

            <Link
              href="/request-product"
              onClick={() => setIsMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-body-sm font-bold text-ragab-ink-800 hover:bg-teal-50/70 transition-colors"
            >
              <Pill className="w-4 h-4 text-teal-600 shrink-0" />
              <span className="flex-1">{isRTL ? 'طلب توفير دواء أو منتج' : 'Request a Product'}</span>
            </Link>
          </div>

          {/* 4. Shopping & Discovery (التسوق والتوفير) */}
          <div className="space-y-1 pt-2 border-t border-ragab-ink-100">
            <p className="px-3 pt-1 pb-1 text-[11px] font-bold uppercase tracking-wider text-ragab-ink-400">
              {isRTL ? 'التسوق والتوفير' : 'Shopping & Offers'}
            </p>

            <Link
              href="/offers"
              onClick={() => setIsMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-body-sm font-bold text-ragab-ink-800 hover:bg-rose-50/70 transition-colors"
            >
              <Tag className="w-4 h-4 text-rose-500 shrink-0" />
              <span className="flex-1">{t.navigation.offers}</span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-700">
                {isRTL ? 'تخفيضات' : 'Sale'}
              </span>
            </Link>

            <Link
              href="/categories?sort=popular"
              onClick={() => setIsMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-body-sm font-bold text-ragab-ink-800 hover:bg-orange-50/70 transition-colors"
            >
              <Flame className="w-4 h-4 text-orange-500 shrink-0" />
              <span>{t.navigation.bestSellers}</span>
            </Link>

            <Link
              href="/favorites"
              onClick={() => setIsMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-body-sm font-bold text-ragab-ink-800 hover:bg-pink-50/70 transition-colors"
            >
              <Heart className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{t.navigation.favorites}</span>
            </Link>
          </div>

          {/* 5. Departments (أقسام الصيدلية بأيقونات SVG بدون إيموجي) */}
          <div className="pt-2 border-t border-ragab-ink-100">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-ragab-ink-400 px-3 mb-1">
              {t.common.allDepartments}
            </h4>
            <div className="space-y-0.5">
              {topLevel.map((c) => (
                <Link
                  key={c.id}
                  href={`/category/${c.slug}`}
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-3 py-2 px-3 rounded-xl text-body-sm font-semibold text-ragab-ink-700 hover:bg-ragab-ink-50 transition-colors"
                >
                  <span
                    aria-hidden="true"
                    className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-100/80"
                  >
                    <CategorySvgIcon iconName={c.iconName} className="w-4 h-4" />
                  </span>
                  <span>{isRTL ? c.nameAr : c.nameEn}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* 6. Support & Info (المعلومات والمساعدة) */}
          <div className="pt-2 border-t border-ragab-ink-100 space-y-1">
            <Link
              href="/contact"
              onClick={() => setIsMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-body-sm font-bold text-ragab-ink-700 hover:bg-ragab-ink-50 transition-colors"
            >
              <HelpCircle className="w-4 h-4 text-blue-500 shrink-0" />
              <span>{isRTL ? 'الدعم والمساعدة وتواصل معنا' : 'Help & Support'}</span>
            </Link>

            <Link
              href="/about"
              onClick={() => setIsMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-body-sm font-bold text-ragab-ink-700 hover:bg-ragab-ink-50 transition-colors"
            >
              <Info className="w-4 h-4 text-ragab-ink-400 shrink-0" />
              <span>{t.navigation.about}</span>
            </Link>

            <button
              onClick={() => {
                toggleLanguage();
                setIsMenuOpen(false);
              }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-body-sm font-bold text-ragab-ink-700 hover:bg-ragab-ink-50 transition-colors w-full font-english"
            >
              <Globe className="w-4 h-4 text-ragab-brand-600 shrink-0" />
              <span>{t.navigation.languageToggle}</span>
            </button>

            {isLoggedIn && (
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-body-sm font-bold text-ragab-danger hover:bg-red-50 transition-colors w-full text-start"
              >
                <LogOut className="w-4 h-4 text-ragab-danger shrink-0" />
                <span>{t.navigation.logout}</span>
              </button>
            )}
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
