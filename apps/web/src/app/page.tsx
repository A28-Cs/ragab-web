'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Clock, Truck, Banknote, RotateCcw, BadgeCheck, WifiOff } from 'lucide-react';
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

  const features = [
    { icon: Truck, title: t.home.feat1Title, desc: t.home.feat1Desc },
    { icon: Banknote, title: t.home.feat2Title, desc: t.home.feat2Desc },
    { icon: RotateCcw, title: t.home.feat3Title, desc: t.home.feat3Desc },
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
      {/* ===== Hero — full-bleed cream band ===== */}
      <section className="bg-ragab-cream border-b border-ragab-brand-200/60">
        <div className="container-page py-10 md:py-14 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Copy */}
            <div className="lg:col-span-6 space-y-5">
              <span className="inline-flex items-center gap-2 h-8 px-3 rounded-full bg-white border border-ragab-ink-200 text-caption font-bold text-ragab-ink-700 shadow-subtle">
                <Clock className="w-3.5 h-3.5 text-ragab-ink-600" />
                {t.home.openNow}
              </span>
              <h1 className="text-display text-ragab-ink-900 tracking-tight max-w-xl">
                {t.home.heroTitle}
              </h1>
              <p className="text-body md:text-lg text-ragab-ink-600 leading-relaxed max-w-lg">
                {t.home.heroSubtitle}
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link href="/categories">
                  <Button variant="primary" size="lg" className="rounded-2xl px-7 h-14 text-base">
                    {t.home.shopNow}
                  </Button>
                </Link>
                <Link href="/offers">
                  <Button variant="outline" size="lg" className="rounded-2xl px-7 h-14 text-base">
                    {t.home.viewOffers}
                  </Button>
                </Link>
              </div>
            </div>

            {/* Feature tiles */}
            <div className="lg:col-span-6 grid grid-cols-2 gap-3 md:gap-4">
              {features.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="bg-white rounded-2xl border border-ragab-ink-200 p-4 md:p-5 shadow-subtle flex flex-col gap-3 min-h-[128px]"
                >
                  <Icon className="w-6 h-6 text-ragab-ink-700" strokeWidth={1.8} />
                  <div className="mt-auto">
                    <div className="text-body font-bold text-ragab-ink-900 leading-snug">{title}</div>
                    <div className="text-caption text-ragab-ink-500 mt-0.5">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
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
