'use client';

import React from 'react';
import { SlidersHorizontal, ArrowUpDown } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { ProductFilters } from '../../services/productService';

type SortValue = NonNullable<ProductFilters['sortBy']>;

interface ProductToolbarProps {
  count: number;
  isLoading: boolean;
  sort: SortValue;
  onSortChange: (v: SortValue) => void;
  /** Opens the filter bottom-sheet on mobile; omit to hide the button */
  onOpenFilters?: () => void;
  activeFilterCount?: number;
}

/** Results count + sort + mobile filter trigger — shared by all listing pages. */
export const ProductToolbar: React.FC<ProductToolbarProps> = ({
  count,
  isLoading,
  sort,
  onSortChange,
  onOpenFilters,
  activeFilterCount = 0,
}) => {
  const { t } = useLanguage();

  const sortOptions: { value: SortValue; label: string }[] = [
    { value: 'popular', label: t.products.sortPopular },
    { value: 'price_low', label: t.products.sortPriceLow },
    { value: 'price_high', label: t.products.sortPriceHigh },
    { value: 'discount', label: t.products.sortDiscount },
    { value: 'rating', label: t.products.sortRating },
    { value: 'newest', label: t.products.sortNewest },
  ];

  return (
    <div className="flex items-center justify-between gap-2 xs:gap-3 font-arabic min-w-0">
      {/* Count — hidden while loading so it never flashes "0" */}
      <p className="text-caption xs:text-body-sm text-ragab-ink-500 min-w-0 truncate" aria-live="polite">
        {isLoading ? (
          <span className="inline-block w-16 xs:w-20 h-4 bg-ragab-ink-200/70 rounded animate-pulse align-middle" />
        ) : (
          <>
            <span className="font-bold text-ragab-ink-800">{count}</span> {t.products.resultsCount}
          </>
        )}
      </p>

      <div className="flex items-center gap-1.5 xs:gap-2 shrink-0">
        {/* Mobile filters */}
        {onOpenFilters && (
          <button
            type="button"
            onClick={onOpenFilters}
            className="lg:hidden inline-flex items-center gap-1 xs:gap-1.5 h-9 xs:h-10 px-2 xs:px-3 rounded-lg bg-white border border-ragab-ink-200 text-caption xs:text-body-sm font-bold text-ragab-ink-800 hover:border-ragab-ink-400 transition-colors focus-ring"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 xs:w-4 xs:h-4 shrink-0" />
            <span>{t.products.filters}</span>
            {activeFilterCount > 0 && (
              <span className="min-w-[16px] xs:min-w-[18px] h-4 xs:h-[18px] px-1 rounded-full bg-ragab-brand-500 text-ragab-ink-800 text-[10px] xs:text-[11px] leading-none font-extrabold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}

        {/* Sort */}
        <label className="relative inline-flex items-center">
          <ArrowUpDown className="w-3.5 h-3.5 xs:w-4 xs:h-4 text-ragab-ink-500 absolute start-2.5 xs:start-3 pointer-events-none" />
          <span className="sr-only">{t.products.sortBy}</span>
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SortValue)}
            className="h-9 xs:h-10 ps-7 xs:ps-9 pe-2.5 xs:pe-3 max-w-[130px] xs:max-w-none rounded-lg bg-white border border-ragab-ink-200 text-caption xs:text-body-sm font-bold text-ragab-ink-800 hover:border-ragab-ink-400 focus:outline-none focus:ring-2 focus:ring-ragab-brand-500/40 transition-colors font-arabic appearance-none cursor-pointer truncate"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
};
