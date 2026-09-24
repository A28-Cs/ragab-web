import React from 'react';
import { Skeleton, ProductCardSkeleton } from '../components/ui/Skeleton';

/** Route-level loading shell — mirrors the common listing layout. */
export default function Loading() {
  return (
    <div className="space-y-6 pb-8" aria-busy="true">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
