'use client';

import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { Chip } from '../ui/Chip';
import { ListingFilterState } from './useProductListing';

interface ActiveFiltersProps {
  state: ListingFilterState;
  onChange: (patch: Partial<ListingFilterState>) => void;
  onClear: () => void;
}

/** Row of removable chips for every active filter. */
export const ActiveFilters: React.FC<ActiveFiltersProps> = ({ state, onChange, onClear }) => {
  const { t } = useLanguage();

  const chips: { key: string; label: string; remove: () => void }[] = [];

  if (state.offersOnly) {
    chips.push({
      key: 'offers',
      label: t.products.filterByOffers,
      remove: () => onChange({ offersOnly: false }),
    });
  }
  if (state.inStockOnly) {
    chips.push({
      key: 'stock',
      label: t.products.filterByAvailability,
      remove: () => onChange({ inStockOnly: false }),
    });
  }
  if (state.minPrice !== undefined || state.maxPrice !== undefined) {
    chips.push({
      key: 'price',
      label: `${t.products.filterByPrice}: ${state.minPrice ?? 0} – ${state.maxPrice ?? '∞'}`,
      remove: () => onChange({ minPrice: undefined, maxPrice: undefined }),
    });
  }
  if (state.brand) {
    chips.push({
      key: 'brand',
      label: state.brand,
      remove: () => onChange({ brand: undefined }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap font-arabic">
      {chips.map((chip) => (
        <Chip key={chip.key} selected onRemove={chip.remove}>
          {chip.label}
        </Chip>
      ))}
      <button
        onClick={onClear}
        className="text-body-sm font-bold text-ragab-ink-500 hover:text-ragab-danger transition-colors py-1 px-2 focus-ring rounded-md"
      >
        {t.products.clearFilters}
      </button>
    </div>
  );
};
