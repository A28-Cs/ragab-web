'use client';

import React from 'react';
import { Product } from '../../types';
import { ProductGrid } from './ProductGrid';

interface ProductStripProps {
  products: Product[];
  isLoading?: boolean;
  skeletonCount?: number;
  showCategory?: boolean;
}

/**
 * Home-page product section: a 2-column grid on phones that grows to
 * 4 columns on desktop (one row of four, like the reference layout).
 */
export const ProductStrip: React.FC<ProductStripProps> = ({
  products,
  isLoading = false,
  skeletonCount = 4,
  showCategory = true,
}) => {
  return (
    <ProductGrid
      products={products}
      isLoading={isLoading}
      skeletonCount={skeletonCount}
      showCategory={showCategory}
      columns="home"
    />
  );
};
