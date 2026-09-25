'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Clock, Truck, Banknote, MessageCircle, BadgeCheck, WifiOff, ArrowLeft, ArrowRight, Cross } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { SectionHeader } from '../components/ui/SectionHeader';
import { ProductStrip } from '../components/product/ProductStrip';
import { CategoryCard } from '../components/product/CategoryCard';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { CategoryCardSkeleton } from '../components/ui/Skeleton';
import {
  getPopularProducts,
  getEssentialProducts,
  getOfferProducts,
  getProducts,
  getProductsByIds,
} from '../services/productService';
import { getCategories } from '../services/categoryService';
import { getRecentlyViewedIds } from '../lib/recentlyViewed';
import { featuredCategories } from '../lib/categoryPresentation';
import { Product, Category } from '../types';

interface CategoryFallback {
  category: Category;
  products: Product[];
}

/**
 * Curated ("popular" / "essential") flags can be empty on a freshly imported
 * catalog even though the store has plenty of real products. Rather than
 * showing an empty "no results" box, fall back to a real department listing
 * so the section always has something worth showing.
 */
async function loadCategoryFallback(
  preferredSlugs: string[],
  exclude: string | undefined,
  allCategories: Category[],
  shownIds: Set<string>,
): Promise<CategoryFallback | null> {
  const category = preferredSlugs
    .filter((slug) => slug !== exclude)
    .map((slug) => allCategories.find((c) => !c.parentId && c.slug === slug))
    .find((c): c is Category => !!c && c.itemCount > 0);
  if (!category) return null;
  try {
    // Best sellers first — not the default newest-first, which surfaces whatever was imported last.
    // A few spare rows so products already shown higher on the page can be skipped.
    const products = (await getProducts({ categoryId: category.id, sortBy: 'popular', limit: 12 }))
      .filter((p) => !shownIds.has(p.id))
      .slice(0, 4);
    return products.length > 0 ? { category, products } : null;
  } catch {
    return null;
  }
}

export default function HomePage() {
  const { t, isRTL } = useLanguage();

  const [categories, setCategories] = useState<Category[]>([]);
  const [offerProducts, setOfferProducts] = useState<Product[]>([]);
  const [popularProducts, setPopularProducts] = useState<Product[]>([]);
  const [popularFallback, setPopularFallback] = useState<CategoryFallback | null>(null);
  const [essentialProducts, setEssentialProducts] = useState<Product[]>([]);
  const [essentialFallback, setEssentialFallback] = useState<CategoryFallback | null>(null);
  const [recentlyViewed, setRecentlyViewed] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const [catsRes, offRes, popRes, essRes] = await Promise.all([
        getCategories(),
        getOfferProducts(4),
        getPopularProducts(4),
        getEssentialProducts(8),
      ]);
      setCategories(catsRes);
      setOfferProducts(offRes);
      setPopularProducts(popRes);
      const seen = new Set([...offRes, ...popRes].map((p) => p.id));
      const essentials = essRes.filter((p) => !seen.has(p.id)).slice(0, 4);
      setEssentialProducts(essentials);

      // Real departments to fall back to, picked by likely relevance —
      // medications first, then personal care, then whatever exists.
      // Sequential (not parallel) so the essentials fallback can avoid repeating
      // whichever department the popular section already fell back to.
      const fallbackSlugs = ['medications', 'personal-care', 'vitamins', 'baby-care', 'skin-care'];
      const popFallback =
        popRes.length === 0 ? await loadCategoryFallback(fallbackSlugs, undefined, catsRes, seen) : null;
      popFallback?.products.forEach((p) => seen.add(p.id));
      const essFallback =
        essentials.length === 0
          ? await loadCategoryFallback(fallbackSlugs, popFallback?.category.slug, catsRes, seen)
          : null;
      setPopularFallback(popFallback);
      setEssentialFallback(essFallback);

      // Fetch recently viewed products in a single batch request
      const ids = getRecentlyViewedIds();
      if (ids.length > 0) {
        const recentProds = await getProductsByIds(ids.slice(0, 8)).catch(() => [] as Product[]);
        // Preserve the viewing order from localStorage
        const byId = new Map(recentProds.map((p) => [p.id, p]));
        setRecentlyViewed(ids.map((id) => byId.get(id)).filter(Boolean) as Product[]);
      }
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const homeCategories = useMemo(() => featuredCategories(categories, 8), [categories]);

  const heroProducts = [...new Map([...offerProducts, ...popularProducts, ...(popularFallback?.products ?? []), ...essentialProducts].filter(p => p.image && p.inStock).map(p => [p.id, p])).values()].slice(0, 3);
  const DirectionArrow = isRTL ? ArrowLeft : ArrowRight;

  const features = [
    { icon: Truck, title: t.home.feat1Title, desc: t.home.feat1Desc },
    { icon: Banknote, title: t.home.feat2Title, desc: t.home.feat2Desc },
    { icon: MessageCircle, title: t.home.feat3Title, desc: t.home.feat3Desc },
    { icon: BadgeCheck, title: t.home.feat4Title, desc: t.home.feat4Desc },
  ];

  if (hasError) {
    return (
      <div className="container-page py-8">
        <EmptyState
          icon={<WifiOff className="w-8 h-8 text-ragab-danger" />}
          title={t.common.errorTitle}
          description={t.common.errorDesc}
          actionLabel={t.common.tryAgain}
          onAction={loadData}
        />
      </div>
    );
  }

  return (
    <div className="pb-10 font-arabic">
      <section aria-labelledby="home-hero" className="container-page pt-5 md:pt-7">
        <div className="overflow-hidden rounded-2xl border border-ragab-brand-200 bg-[#edf7f5]">
          <div className="grid lg:grid-cols-2">
            <div className="p-5 sm:p-8 lg:p-10 flex flex-col justify-center">
              <div className="flex flex-wrap items-center gap-3 text-caption font-bold text-ragab-brand-800 mb-5">
                <span className="inline-flex items-center gap-2"><Cross className="w-4 h-4" />{isRTL ? 'صيدلية رجب · رعاية أقرب إليك' : 'Ragab Pharmacy · Care, closer to you'}</span>
                <span className="inline-flex items-center gap-1.5 text-ragab-ink-600"><Clock className="w-3.5 h-3.5" />{t.home.openNow}</span>
              </div>
              <h1 id="home-hero" className="text-[28px] sm:text-[38px] xl:text-[46px] leading-[1.4] font-extrabold text-ragab-ink-900 tracking-tight max-w-xl">{t.home.heroTitle}</h1>
              <p className="text-body-sm sm:text-base text-ragab-ink-600 leading-7 sm:leading-8 mt-4 max-w-lg">{t.home.heroSubtitle}</p>
              <div className="flex flex-wrap items-center gap-3 mt-6">
                <Link href="/categories" className="inline-flex items-center justify-center gap-3 min-h-12 px-5 rounded-lg bg-ragab-brand-700 hover:bg-ragab-brand-800 text-white font-bold text-body-sm focus-ring transition-colors">{t.home.shopNow}<DirectionArrow className="w-4 h-4" /></Link>
                <Link href="/offers" className="inline-flex items-center justify-center min-h-12 px-3 text-ragab-ink-800 font-bold text-body-sm underline underline-offset-8 decoration-ragab-brand-500 hover:text-ragab-brand-700 focus-ring">{isRTL ? 'عروض اليوم' : 'Today’s offers'}</Link>
              </div>
            </div>
            <div className="relative bg-[#dfefeb] p-5 sm:p-8 flex flex-col justify-center min-w-0 border-t lg:border-t-0 lg:border-s border-ragab-brand-200/60">
              <div className="flex items-center justify-between gap-3 mb-5">
                <div><p className="text-caption text-ragab-brand-800 font-bold">{isRTL ? 'من صيدليتنا إلى بيتك' : 'From our pharmacy to your home'}</p><h2 className="text-xl sm:text-2xl font-bold text-ragab-ink-900 mt-1">{isRTL ? 'عناية تستحقها كل يوم' : 'Everyday care, thoughtfully chosen'}</h2></div>
                <BadgeCheck className="w-9 h-9 text-ragab-brand-700 shrink-0" strokeWidth={1.4} />
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3 items-end" aria-busy={isLoading}>
                {isLoading ? [0, 1, 2].map(i => <div key={i} className="h-44 sm:h-60 rounded-xl bg-white/70 animate-pulse" />) : heroProducts.length > 0 ? heroProducts.map((product, index) => (
                  <Link key={product.id} href={'/product/' + product.slug} className={'group min-w-0 bg-white rounded-xl border border-white p-2.5 sm:p-3 focus-ring hover:border-ragab-brand-400 transition-colors ' + (index === 1 ? 'pb-5 sm:pb-7' : '')}>
                    <div className={'relative w-full ' + (index === 1 ? 'h-28 sm:h-44' : 'h-24 sm:h-36')}><Image src={product.image} alt={isRTL ? product.nameAr : product.nameEn || product.nameAr} fill sizes="(max-width: 640px) 27vw, (max-width: 1024px) 28vw, 160px" className="object-contain p-1" /></div>
                    <p className="text-[11px] sm:text-caption leading-5 font-semibold text-ragab-ink-800 line-clamp-2 mt-3 min-h-10">{isRTL ? product.nameAr : product.nameEn || product.nameAr}</p>
                    <p className="text-caption sm:text-body-sm font-bold text-ragab-brand-800 mt-2">{new Intl.NumberFormat(isRTL ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 2 }).format(product.price)} <span className="text-[10px]">{t.common.egp}</span></p>
                  </Link>
                )) : <Link href="/categories" className="col-span-3 flex items-center justify-between p-8 bg-white rounded-xl focus-ring"><Cross className="w-16 h-16 text-ragab-brand-600" /><span className="font-bold">{t.home.categoriesTitle}</span><DirectionArrow className="w-5 h-5" /></Link>}
              </div>
              <Link href="/categories" className="inline-flex items-center gap-2 text-caption font-bold text-ragab-brand-800 mt-5 focus-ring self-start">{t.common.viewAllCategories}<DirectionArrow className="w-3.5 h-3.5" /></Link>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 bg-white border-t border-ragab-brand-200 px-3 py-2 sm:px-5">
            {features.map(({ icon: Icon, title, desc }) => <div key={title} className="flex items-start gap-2.5 p-3 sm:p-4"><Icon className="w-5 h-5 shrink-0 mt-1 text-ragab-brand-700" strokeWidth={1.6} /><div><p className="text-caption sm:text-body-sm font-bold text-ragab-ink-800">{title}</p><p className="text-[11px] sm:text-caption text-ragab-ink-500 mt-1">{desc}</p></div></div>)}
          </div>
        </div>
      </section>

      <div className="container-page space-y-12 md:space-y-16 pt-10 md:pt-14">
        {/* ===== Categories ===== */}
        <section aria-labelledby="home-categories" id="categories">
          <SectionHeader
            id="home-categories"
            title={t.home.categoriesTitle}
            subtitle={t.home.categoriesSubtitle}
            actionHref="/categories"
            actionLabel={t.common.viewAllCategories}
          />
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-3 md:gap-4">
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => <CategoryCardSkeleton key={i} />)
              : homeCategories.map((category) => (
                  <CategoryCard key={category.id} category={category} />
                ))}
          </div>
        </section>

        {/* ===== Today's deals ===== */}
        {(isLoading || offerProducts.length > 0) && (
          <section aria-labelledby="home-deals" id="deals">
            <SectionHeader
              id="home-deals"
              title={t.home.todaysOffers}
              subtitle={t.home.offersSubtitle}
              actionHref="/offers"
            />
            <ProductStrip products={offerProducts} isLoading={isLoading} skeletonCount={4} />
          </section>
        )}

        {/* ===== Most ordered — falls back to a real department when no product is curated as popular yet ===== */}
        {(isLoading || popularProducts.length > 0) && (
          <section aria-labelledby="home-popular">
            <SectionHeader
              id="home-popular"
              title={t.home.popularProducts}
              subtitle={t.home.popularSubtitle}
              actionHref="/categories?sort=popular"
            />
            <ProductStrip products={popularProducts} isLoading={isLoading} skeletonCount={4} />
          </section>
        )}
        {!isLoading && popularProducts.length === 0 && popularFallback && (
          <section aria-labelledby="home-popular-fallback">
            <SectionHeader
              id="home-popular-fallback"
              title={isRTL ? popularFallback.category.nameAr : popularFallback.category.nameEn}
              subtitle={t.home.categoriesSubtitle}
              actionHref={`/category/${popularFallback.category.slug}`}
            />
            <ProductStrip products={popularFallback.products} showCategory={false} />
          </section>
        )}

        {/* ===== Household staples — same fallback treatment ===== */}
        {(isLoading || essentialProducts.length > 0) && (
          <section aria-labelledby="home-essentials">
            <SectionHeader
              id="home-essentials"
              title={t.home.essentialsTitle}
              subtitle={t.home.essentialsSubtitle}
              actionHref="/category/medications"
            />
            <ProductStrip products={essentialProducts} isLoading={isLoading} skeletonCount={4} />
          </section>
        )}
        {!isLoading && essentialProducts.length === 0 && essentialFallback && (
          <section aria-labelledby="home-essentials-fallback">
            <SectionHeader
              id="home-essentials-fallback"
              title={isRTL ? essentialFallback.category.nameAr : essentialFallback.category.nameEn}
              subtitle={t.home.categoriesSubtitle}
              actionHref={`/category/${essentialFallback.category.slug}`}
            />
            <ProductStrip products={essentialFallback.products} showCategory={false} />
          </section>
        )}

        {/* ===== Recently viewed ===== */}
        {!isLoading && recentlyViewed.length > 0 && (
          <section aria-labelledby="home-recent">
            <SectionHeader id="home-recent" title={t.home.recentlyViewed} />
            <ProductStrip products={recentlyViewed.slice(0, 4)} showCategory />
          </section>
        )}

        {/* ===== Free-delivery CTA ===== */}
        <section
          aria-labelledby="home-cta"
          className="bg-ragab-ink-800 text-white rounded-3xl px-6 py-10 md:px-12 md:py-14 text-center"
        >
          <h2 id="home-cta" className="text-h2 md:text-3xl font-extrabold tracking-tight">
            {t.home.ctaTitle}
          </h2>
          <p className="text-body-sm md:text-body text-ragab-ink-300 mt-3 max-w-2xl mx-auto leading-relaxed">
            {t.home.ctaDesc}
          </p>
          <Link href="/cart" className="inline-block mt-7">
            <Button variant="primary" size="lg" className="rounded-2xl px-8">
              {t.home.ctaButton}
            </Button>
          </Link>
        </section>
      </div>
    </div>
  );
}
