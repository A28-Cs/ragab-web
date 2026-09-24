'use client';

import React, { useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { getCategories } from '../../services/categoryService';
import { getCategoryFacetCounts } from '../../services/productService';
import { Category } from '../../types';
import { ProductGrid } from '../../components/product/ProductGrid';
import { ProductToolbar } from '../../components/product/ProductToolbar';
import { FilterPanel } from '../../components/product/FilterPanel';
import { ActiveFilters } from '../../components/product/ActiveFilters';
import { useProductListing } from '../../components/product/useProductListing';
import { InfiniteScrollTrigger } from '../../components/product/InfiniteScrollTrigger';
import { Button } from '../../components/ui/Button';
import { Drawer } from '../../components/ui/Drawer';
import { EmptyState } from '../../components/ui/EmptyState';
import { Chip } from '../../components/ui/Chip';

const POPULAR_SEARCHES = ['زيت', 'أرز', 'لبن', 'شاي', 'مسحوق غسيل', 'جبنة'];

function SearchContent() {
  const { t, isRTL } = useLanguage();
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = (searchParams.get('q') || '').trim();

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  const listing = useProductListing({ searchQuery: query || undefined });

  // Keep listing in sync when the ?q= param changes
  useEffect(() => {
    listing.update({ searchQuery: query || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  // Per-category result counts for THIS search (category filter excluded so every
  // category's count reflects switching to it, not just the one already selected) — the
  // sidebar must show how many of the search results are in each category, not each
  // category's unrelated total catalog size, and categories with zero matches disappear.
  useEffect(() => {
    if (!query) {
      setCategoryCounts({});
      return;
    }
    let alive = true;
    getCategoryFacetCounts({
      searchQuery: query,
      minPrice: listing.filters.minPrice,
      maxPrice: listing.filters.maxPrice,
      inStockOnly: listing.filters.inStockOnly,
      offersOnly: listing.filters.offersOnly,
      brand: listing.filters.brand,
    })
      .then((counts) => alive && setCategoryCounts(counts))
      .catch(() => alive && setCategoryCounts({}));
    return () => {
      alive = false;
    };
  }, [
    query,
    listing.filters.minPrice,
    listing.filters.maxPrice,
    listing.filters.inStockOnly,
    listing.filters.offersOnly,
    listing.filters.brand,
  ]);

  const brands = useMemo(
    () => Array.from(new Set(listing.products.map((p) => p.brandAr).filter(Boolean))) as string[],
    [listing.products]
  );

  // ===== Empty query → "start searching" state =====
  if (!query) {
    return (
      <div className="space-y-6 pb-12 font-arabic">
        <EmptyState
          icon={<Search className="w-8 h-8 text-ragab-brand-700" />}
          title={t.products.startSearchTitle}
          description={t.products.startSearchDesc}
        />
        <div className="max-w-xl mx-auto space-y-4">
          <div>
            <h3 className="text-label text-ragab-ink-500 mb-2">{t.products.popularSearches}</h3>
            <div className="flex flex-wrap gap-2">
              {POPULAR_SEARCHES.map((q) => (
                <Chip key={q} onClick={() => router.push(`/search?q=${encodeURIComponent(q)}`)}>
                  {q}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-label text-ragab-ink-500 mb-2">{t.products.browseCategories}</h3>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <Chip key={c.id} onClick={() => router.push(`/category/${c.slug}`)}>
                  {isRTL ? c.nameAr : c.nameEn}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const filterPanel = (
    <FilterPanel
      state={listing.filters}
      onChange={listing.update}
      onClear={() => listing.reset({ searchQuery: query })}
      categories={categories}
      categoryCounts={categoryCounts}
      brands={brands}
      hasActiveFilters={listing.activeFilterCount > 0 || !!listing.filters.categoryId}
    />
  );

  return (
    <div className="space-y-5 pb-12 font-arabic">
      {/* Header */}
      <div>
        <h1 className="text-h2 text-ragab-ink-800 flex items-center gap-2">
          <Search className="w-5 h-5 text-ragab-brand-700 shrink-0" />
          <span>
            {isRTL ? 'نتائج البحث عن' : 'Search results for'}: &quot;{query}&quot;
          </span>
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        <aside className="hidden lg:block col-span-1 bg-white p-5 rounded-xl border border-ragab-ink-200 shadow-subtle h-fit sticky top-24">
          {filterPanel}
        </aside>

        <div className="lg:col-span-3 space-y-4">
          <ProductToolbar
            count={listing.products.length}
            isLoading={listing.isLoading}
            sort={listing.filters.sortBy}
            onSortChange={(v) => listing.update({ sortBy: v })}
            onOpenFilters={() => setIsFilterDrawerOpen(true)}
            activeFilterCount={listing.activeFilterCount}
          />

          <ActiveFilters
            state={listing.filters}
            onChange={listing.update}
            onClear={() => listing.reset({ searchQuery: query })}
          />

          <ProductGrid
            products={listing.visibleProducts}
            isLoading={listing.isLoading}
            error={listing.hasError}
            onRetry={listing.retry}
            columns="narrow"
            emptyActionLabel={t.products.browseCategories}
            emptyActionHref="/categories"
          />

          <InfiniteScrollTrigger
            hasMore={listing.hasMore}
            isLoading={listing.isLoading}
            onLoadMore={listing.showMore}
          />
        </div>
      </div>

      <Drawer
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        title={t.products.filters}
        position="bottom"
      >
        {filterPanel}
        <div className="pt-4">
          <Button variant="primary" fullWidth onClick={() => setIsFilterDrawerOpen(false)}>
            {t.common.confirm}
          </Button>
        </div>
      </Drawer>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center font-arabic">...</div>}>
      <SearchContent />
    </Suspense>
  );
}
