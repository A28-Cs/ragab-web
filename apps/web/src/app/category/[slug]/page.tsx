'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '../../../context/LanguageContext';
import { getCategories, getCategoryBySlug } from '../../../services/categoryService';
import { Category } from '../../../types';
import { ProductGrid } from '../../../components/product/ProductGrid';
import { ProductToolbar } from '../../../components/product/ProductToolbar';
import { FilterPanel } from '../../../components/product/FilterPanel';
import { ActiveFilters } from '../../../components/product/ActiveFilters';
import { SubcategoryChips } from '../../../components/product/SubcategoryChips';
import { useProductListing } from '../../../components/product/useProductListing';
import { InfiniteScrollTrigger } from '../../../components/product/InfiniteScrollTrigger';
import { Button } from '../../../components/ui/Button';
import { Drawer } from '../../../components/ui/Drawer';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { SearchX } from 'lucide-react';

export default function CategoryDetailPage() {
  const { slug } = useParams();
  const router = useRouter();
  const { t, isRTL } = useLanguage();

  const [category, setCategory] = useState<Category | null>(null);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [categoryChecked, setCategoryChecked] = useState(false);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  const listing = useProductListing();

  useEffect(() => {
    getCategories().then(setAllCategories).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    setCategoryChecked(false);
    if (typeof slug === 'string') {
      getCategoryBySlug(slug)
        .then((catObj) => {
          if (!alive) return;
          setCategory(catObj);
          setCategoryChecked(true);
          if (catObj) listing.update({ categoryId: catObj.id });
        })
        .catch(() => alive && setCategoryChecked(true));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const brands = useMemo(
    () => Array.from(new Set(listing.products.map((p) => p.brandAr).filter(Boolean))) as string[],
    [listing.products]
  );

  // Unknown slug → clear not-found state (client page: render inline 404)
  if (categoryChecked && !category) {
    return (
      <EmptyState
        icon={<SearchX className="w-8 h-8 text-ragab-brand-700" />}
        title={t.products.noResultsTitle}
        description={t.products.noResultsDesc}
        actionLabel={t.products.browseCategories}
        actionHref="/categories"
      />
    );
  }

  const catName = category ? (isRTL ? category.nameAr : category.nameEn) : '';
  const catDesc = category
    ? isRTL
      ? category.descriptionAr
      : category.descriptionEn || category.descriptionAr
    : undefined;

  const filterPanel = (
    <FilterPanel
      state={listing.filters}
      onChange={listing.update}
      onClear={() => listing.reset({ categoryId: category?.id })}
      brands={brands}
      hasActiveFilters={listing.activeFilterCount > 0}
    />
  );

  // Wait until the category id filter is applied before showing cross-category data
  const isLoading = listing.isLoading || !categoryChecked || !listing.filters.categoryId;

  return (
    <div className="space-y-5 pb-8 font-arabic">
      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="flex items-center gap-2 text-caption font-semibold text-ragab-ink-500">
        <Link href="/" className="hover:text-ragab-ink-800 transition-colors">
          {t.navigation.home}
        </Link>
        <span>/</span>
        <Link href="/categories" className="hover:text-ragab-ink-800 transition-colors">
          {t.products.allProducts}
        </Link>
        <span>/</span>
        <span className="text-ragab-ink-800 font-bold">{catName || '…'}</span>
      </nav>

      {/* Category header */}
      <div>
        {categoryChecked && category ? (
          <>
            <h1 className="text-h1 text-ragab-ink-800">{catName}</h1>
            {catDesc && <p className="text-body-sm text-ragab-ink-500 mt-1">{catDesc}</p>}
          </>
        ) : (
          <>
            <Skeleton className="h-8 w-56 mb-2" />
            <Skeleton className="h-4 w-72" />
          </>
        )}
      </div>

      {category && (
        <SubcategoryChips
          categories={allCategories}
          parent={category}
          activeCategoryId={listing.filters.categoryId}
          onSelect={(id) => listing.update({ categoryId: id })}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Sidebar (lg+) */}
        <aside className="hidden lg:block col-span-1 bg-white p-5 rounded-xl border border-ragab-ink-200 shadow-subtle h-fit sticky top-[calc(var(--header-h)+1rem)]">
          {filterPanel}
        </aside>

        <div className="lg:col-span-3 space-y-4">
          <ProductToolbar
            count={listing.products.length}
            isLoading={isLoading}
            sort={listing.filters.sortBy}
            onSortChange={(v) => listing.update({ sortBy: v })}
            onOpenFilters={() => setIsFilterDrawerOpen(true)}
            activeFilterCount={listing.activeFilterCount}
          />

          <ActiveFilters
            state={listing.filters}
            onChange={listing.update}
            onClear={() => listing.reset({ categoryId: category?.id })}
          />

          <ProductGrid
            products={listing.visibleProducts}
            isLoading={isLoading}
            error={listing.hasError}
            onRetry={listing.retry}
            columns="narrow"
            showCategory={false}
            emptyActionLabel={t.products.browseCategories}
            emptyActionHref="/categories"
          />

          <InfiniteScrollTrigger
            hasMore={listing.hasMore}
            isLoading={isLoading}
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
