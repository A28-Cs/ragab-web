'use client';

import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@ragab/utils';
import { useLanguage } from '../../context/LanguageContext';
import { Category } from '../../types';
import { Button } from '../ui/Button';
import { ListingFilterState } from './useProductListing';

interface FilterPanelProps {
  state: ListingFilterState;
  onChange: (patch: Partial<ListingFilterState>) => void;
  onClear: () => void;
  /** Category list — omit on pages already scoped to one category */
  categories?: Category[];
  /**
   * Result-scoped counts (e.g. per the active search query), keyed by category id.
   * When provided, it replaces each category's static `itemCount` and categories with
   * no matches are hidden instead of showing a stale/irrelevant number.
   */
  categoryCounts?: Record<string, number>;
  /** Distinct brand names available in the current result set */
  brands?: string[];
  hasActiveFilters: boolean;
}

/** Filter controls — sidebar on lg+, content of a bottom-sheet below. */
export const FilterPanel: React.FC<FilterPanelProps> = ({
  state,
  onChange,
  onClear,
  categories,
  categoryCounts,
  brands = [],
  hasActiveFilters,
}) => {
  const { t, isRTL } = useLanguage();

  // With result-scoped counts, a category the current filters match zero products in
  // isn't a useful choice — hide it instead of showing "0" (or a stale global count).
  const visibleCategories = categoryCounts
    ? categories?.filter((cat) => (categoryCounts[cat.id] ?? 0) > 0)
    : categories;

  return (
    <div className="space-y-6 font-arabic">
      {/* Category list */}
      {visibleCategories && visibleCategories.length > 0 && (
        <div>
          <h4 className="text-label text-ragab-ink-800 mb-3 pb-2 border-b border-ragab-ink-100">
            {t.navigation.categories}
          </h4>
          <div className="space-y-1 text-body-sm font-semibold">
            <button
              onClick={() => onChange({ categoryId: undefined })}
              className={cn(
                'w-full text-start px-3 py-2.5 rounded-lg transition-colors flex items-center justify-between focus-ring',
                !state.categoryId
                  ? 'bg-ragab-brand-500 text-ragab-ink-800 font-bold shadow-subtle'
                  : 'hover:bg-ragab-ink-100 text-ragab-ink-700'
              )}
            >
              <span>{t.products.allCategories}</span>
            </button>
            {visibleCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => onChange({ categoryId: cat.id })}
                className={cn(
                  'w-full text-start px-3 py-2.5 rounded-lg transition-colors flex items-center justify-between focus-ring',
                  state.categoryId === cat.id
                    ? 'bg-ragab-brand-500 text-ragab-ink-800 font-bold shadow-subtle'
                    : 'hover:bg-ragab-ink-100 text-ragab-ink-700'
                )}
              >
                <span>{isRTL ? cat.nameAr : cat.nameEn}</span>
                <span className="text-caption text-ragab-ink-500 bg-ragab-ink-50 px-1.5 py-0.5 rounded">
                  {categoryCounts ? categoryCounts[cat.id] ?? 0 : cat.itemCount}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Price range */}
      <div className={cn(categories && 'pt-4 border-t border-ragab-ink-100')}>
        <h4 className="text-label text-ragab-ink-800 mb-3">{t.products.priceRange}</h4>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder={isRTL ? 'من' : 'From'}
            value={state.minPrice ?? ''}
            onChange={(e) =>
              onChange({ minPrice: e.target.value === '' ? undefined : Number(e.target.value) })
            }
            className="w-full h-10 px-3 rounded-lg border border-ragab-ink-200 text-body-sm focus:outline-none focus:ring-2 focus:ring-ragab-brand-500/40 focus:border-ragab-brand-500"
          />
          <span className="text-ragab-ink-500">–</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder={isRTL ? 'إلى' : 'To'}
            value={state.maxPrice ?? ''}
            onChange={(e) =>
              onChange({ maxPrice: e.target.value === '' ? undefined : Number(e.target.value) })
            }
            className="w-full h-10 px-3 rounded-lg border border-ragab-ink-200 text-body-sm focus:outline-none focus:ring-2 focus:ring-ragab-brand-500/40 focus:border-ragab-brand-500"
          />
        </div>
      </div>

      {/* Quick toggles */}
      <div className="space-y-3 pt-4 border-t border-ragab-ink-100">
        <label className="flex items-center gap-2.5 cursor-pointer text-body-sm font-semibold text-ragab-ink-700 py-1">
          <input
            type="checkbox"
            checked={state.offersOnly}
            onChange={(e) => onChange({ offersOnly: e.target.checked })}
            className="w-[18px] h-[18px] rounded accent-ragab-brand-500"
          />
          <span>{t.products.filterByOffers}</span>
        </label>
        <label className="flex items-center gap-2.5 cursor-pointer text-body-sm font-semibold text-ragab-ink-700 py-1">
          <input
            type="checkbox"
            checked={state.inStockOnly}
            onChange={(e) => onChange({ inStockOnly: e.target.checked })}
            className="w-[18px] h-[18px] rounded accent-ragab-brand-500"
          />
          <span>{t.products.filterByAvailability}</span>
        </label>
      </div>

      {/* Brands */}
      {brands.length > 1 && (
        <div className="pt-4 border-t border-ragab-ink-100">
          <h4 className="text-label text-ragab-ink-800 mb-3">{t.products.filterByBrand}</h4>
          {/* chefaa alone can surface 50+ distinct brands per category — bound the list to a
              scrollable box instead of letting it grow the whole (sticky) sidebar unboundedly. */}
          <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto pe-1">
            {brands.map((b) => (
              <button
                key={b}
                onClick={() => onChange({ brand: state.brand === b ? undefined : b })}
                className={cn(
                  'h-9 px-3 rounded-full border text-body-sm font-semibold transition-colors focus-ring',
                  state.brand === b
                    ? 'bg-ragab-ink-800 text-white border-ragab-ink-800'
                    : 'bg-white text-ragab-ink-700 border-ragab-ink-200 hover:border-ragab-ink-400'
                )}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      )}

      {hasActiveFilters && (
        <Button variant="outline" size="sm" fullWidth onClick={onClear}>
          <X className="w-3.5 h-3.5" />
          <span>{t.products.clearFilters}</span>
        </Button>
      )}
    </div>
  );
};
