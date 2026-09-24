'use client';

import React from 'react';
import { cn } from '@ragab/utils';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => {
  return <div className={cn('animate-pulse bg-ragab-ink-200/70 rounded-md', className)} />;
};

/**
 * Mirrors the real ProductCard anatomy (square media, 2-line name,
 * meta row, rating row, price + action row) so loading → loaded
 * causes zero layout shift.
 */
export const ProductCardSkeleton: React.FC = () => {
  return (
    <div className="bg-white rounded-2xl border border-ragab-ink-200 overflow-hidden flex flex-col">
      <Skeleton className="w-full aspect-square rounded-none" />
      <div className="p-4">
        <Skeleton className="h-4 w-full mb-1.5" />
        <Skeleton className="h-4 w-2/3 mb-2" />
        <Skeleton className="h-3 w-1/2 mb-2.5" />
        <Skeleton className="h-3.5 w-2/5 mb-4" />
        <div className="flex items-end justify-between gap-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-10 w-20 rounded-xl" />
        </div>
      </div>
    </div>
  );
};

/** Category tile skeleton for home grids */
export const CategoryCardSkeleton: React.FC = () => {
  return (
    <div className="bg-white rounded-2xl border border-ragab-ink-200 px-3 py-5 flex flex-col items-center">
      <Skeleton className="w-9 h-9 rounded-full mb-3" />
      <Skeleton className="h-4 w-2/3 mb-2" />
      <Skeleton className="h-3 w-1/3" />
    </div>
  );
};

/** Offer banner skeleton — mirrors the compact OfferCard strip height */
export const OfferBannerSkeleton: React.FC = () => {
  return <Skeleton className="w-full h-28 sm:h-32 rounded-2xl" />;
};
