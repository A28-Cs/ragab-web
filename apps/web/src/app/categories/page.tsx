'use client';

import React, { useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { getCategories } from '../../services/categoryService';
import { ProductFilters } from '../../services/productService';
import { Category } from '../../types';
import { ProductGrid } from '../../components/product/ProductGrid';
import { ProductToolbar } from '../../components/product/ProductToolbar';
import { FilterPanel } from '../../components/product/FilterPanel';
import { ActiveFilters } from '../../components/product/ActiveFilters';
import { SubcategoryChips } from '../../components/product/SubcategoryChips';
import { useProductListing } from '../../components/product/useProductListing';
import { InfiniteScrollTrigger } from '../../components/product/InfiniteScrollTrigger';
import { Button } from '../../components/ui/Button';
import { Drawer } from '../../components/ui/Drawer';
import { CategoryCard } from '../../components/product/CategoryCard';
import { CategoryCardSkeleton } from '../../components/ui/Skeleton';

function CategoriesContent() {
  const { t, isRTL } = useLanguage();
  const searchParams = useSearchParams();

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  // Bare `/categories` shows the departments grid (matching the mobile app, the
  // bottom-nav "categories" tab and the homepage "view all"). A product query
  // (?sort / ?cat / ?offers — e.g. the best-sellers links) switches to the catalog.
  const isListingMode =
    searchParams.has('sort') || searchParams.has('cat') || searchParams.has('offers');

  const listing = useProductListing({
    categoryId: searchParams.get('cat') || undefined,
    sortBy: (searchParams.get('sort') as ProductFilters['sortBy']) || 'popular',
    offersOnly: searchParams.get('offers') === 'true',
  });

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => {})
      .finally(() => setCategoriesLoading(false));
  }, []);

  const brands = useMemo(
    () => Array.from(new Set(listing.products.map((p) => p.brandAr).filter(Boolean))) as string[],
    [listing.products]
  );

  const hasActiveFilters = listing.activeFilterCount > 0 || !!listing.filters.categoryId;

  // Top-level departments only — a subcategory ("مياه") is reached from within its
  // parent's listing (the chips below), never as its own tile on this grid.
  const topLevelCategories = useMemo(() => categories.filter((c) => !c.parentId), [categories]);

  // `cat` may be an id or a slug (older links) — resolve it against the full list so the
  // subcategory chips below know which department is being browsed, if any.
  const catParam = searchParams.get('cat');
  const enteredCategory = useMemo(
    () => (catParam ? categories.find((c) => c.id === catParam || c.slug === catParam) : undefined),
    [categories, catParam]
  );

  // ===== Departments grid (default) — browse by category, like the app =====
  if (!isListingMode) {
    return (
      <div className="space-y-5 pb-8 font-arabic">
        <div>
          <h1 className="text-h1 text-ragab-ink-800">{t.navigation.categories}</h1>
          <p className="text-body-sm text-ragab-ink-500 mt-1">{t.home.categoriesSubtitle}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {categoriesLoading
            ? Array.from({ length: 8 }).map((_, i) => <CategoryCardSkeleton key={i} />)
            : topLevelCategories.map((category) => (
                <CategoryCard key={category.id} category={category} />
              ))}
        </div>
      </div>
    );
  }

  // ===== Product catalog (when a listing query is present) =====
  const filterPanel = (
    <FilterPanel
      state={listing.filters}
      onChange={listing.update}
      onClear={() => listing.reset()}
      categories={topLevelCategories}
      brands={brands}
      hasActiveFilters={hasActiveFilters}
    />
  );

  return (
    <div className="space-y-5 pb-8 font-arabic">
      {/* Page header */}
      <div>
        <h1 className="text-h1 text-ragab-ink-800">
          {enteredCategory ? (isRTL ? enteredCategory.nameAr : enteredCategory.nameEn) : t.products.allProducts}
        </h1>
      </div>

      <SubcategoryChips
        categories={categories}
        parent={enteredCategory}
        activeCategoryId={listing.filters.categoryId}
        onSelect={(id) => listing.update({ categoryId: id })}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Sidebar (lg+) */}
        <aside className="hidden lg:block col-span-1 bg-white p-5 rounded-xl border border-ragab-ink-200 shadow-subtle h-fit sticky top-[calc(var(--header-h)+1rem)]">
          {filterPanel}
        </aside>

        {/* Results */}
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
            onClear={() => listing.reset()}
          />

          <ProductGrid
            products={listing.visibleProducts}
            isLoading={listing.isLoading}
            error={listing.hasError}
            onRetry={listing.retry}
            columns="narrow"
            emptyActionLabel={t.products.clearFilters}
          />

          <InfiniteScrollTrigger
            hasMore={listing.hasMore}
            isLoading={listing.isLoading}
            onLoadMore={listing.showMore}
          />
        </div>
      </div>

      {/* Mobile filter bottom-sheet */}
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

export default function CategoriesPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center font-arabic">...</div>}>
      <CategoriesContent />
    </Suspense>
  );
}
