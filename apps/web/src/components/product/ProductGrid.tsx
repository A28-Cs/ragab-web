'use client';

import React from 'react';
import { SearchX, WifiOff } from 'lucide-react';
import { cn } from '@ragab/utils';
import { Product } from '../../types';
import { ProductCard } from './ProductCard';
import { ProductCardSkeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { useLanguage } from '../../context/LanguageContext';

interface ProductGridProps {
  products: Product[];
  isLoading?: boolean;
  /** Set when data loading failed — renders a retry state instead of "no results" */
  error?: boolean;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  emptyActionHref?: string;
  /** 'wide' = full-width pages, 'narrow' = grids inside a filtered 2-col layout */
  columns?: 'wide' | 'narrow' | 'home';
  skeletonCount?: number;
  showCategory?: boolean;
}

const gridClasses = {
  wide: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 3xl:grid-cols-6 gap-3 sm:gap-4 lg:gap-5',
  narrow: 'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4',
  home: 'grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 lg:gap-5',
};

export const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  isLoading = false,
  error = false,
  onRetry,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  emptyActionHref,
  columns = 'wide',
  skeletonCount = 8,
  showCategory = true,
}) => {
  const { t } = useLanguage();

  if (isLoading) {
    return (
      <div className={cn(gridClasses[columns])} aria-busy="true">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<WifiOff className="w-8 h-8 text-ragab-danger" />}
        title={t.common.errorTitle}
        description={t.common.errorDesc}
        actionLabel={t.common.tryAgain}
        onAction={onRetry}
      />
    );
  }

  if (products.length === 0) {
    return (
      <EmptyState
        icon={<SearchX className="w-8 h-8 text-ragab-brand-700" />}
        title={emptyTitle || t.products.noResultsTitle}
        description={emptyDescription || t.products.noResultsDesc}
        actionLabel={emptyActionLabel}
        actionHref={emptyActionHref}
      />
    );
  }

  return (
    <div className={cn(gridClasses[columns])}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} showCategory={showCategory} />
      ))}
    </div>
  );
};
