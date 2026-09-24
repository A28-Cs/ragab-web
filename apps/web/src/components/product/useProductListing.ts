'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getProducts, ProductFilters } from '../../services/productService';
import { Product } from '../../types';

export interface ListingFilterState {
  categoryId?: string;
  sortBy: NonNullable<ProductFilters['sortBy']>;
  inStockOnly: boolean;
  offersOnly: boolean;
  minPrice?: number;
  maxPrice?: number;
  brand?: string;
  searchQuery?: string;
}

export const DEFAULT_LISTING_STATE: ListingFilterState = {
  sortBy: 'popular',
  inStockOnly: false,
  offersOnly: false,
};

const PAGE_SIZE = 12;

/**
 * Shared data layer for every product listing page:
 * loading / error / retry, "show more" paging on top of the
 * (non-paginated) product service, and active-filter accounting.
 */
export function useProductListing(initial: Partial<ListingFilterState> = {}) {
  const [filters, setFilters] = useState<ListingFilterState>({
    ...DEFAULT_LISTING_STATE,
    ...initial,
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const abortControllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const res = await getProducts({
        categoryId: filters.categoryId,
        sortBy: filters.sortBy,
        inStockOnly: filters.inStockOnly,
        offersOnly: filters.offersOnly,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        brand: filters.brand,
        searchQuery: filters.searchQuery,
      }, abortController.signal);

      setProducts(res);
      setVisibleCount(PAGE_SIZE);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setHasError(true);
    } finally {
      if (abortControllerRef.current === abortController) {
        setIsLoading(false);
      }
    }
  }, [filters]);

  useEffect(() => {
    load();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [load]);

  const update = useCallback((patch: Partial<ListingFilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback((next: Partial<ListingFilterState> = {}) => {
    setFilters({ ...DEFAULT_LISTING_STATE, ...next });
  }, []);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.inStockOnly) n++;
    if (filters.offersOnly) n++;
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) n++;
    if (filters.brand) n++;
    return n;
  }, [filters]);

  // Stable identity so an infinite-scroll observer bound to it doesn't tear down and
  // reattach on every render.
  const showMore = useCallback(() => setVisibleCount((c) => c + PAGE_SIZE), []);

  return {
    filters,
    update,
    reset,
    products,
    visibleProducts: products.slice(0, visibleCount),
    hasMore: products.length > visibleCount,
    showMore,
    isLoading,
    hasError,
    retry: load,
    activeFilterCount,
  };
}
