'use client';

import React, { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useFavorites } from '../../context/FavoritesContext';
import { getProducts } from '../../services/productService';
import { Product } from '../../types';
import { ProductGrid } from '../../components/product/ProductGrid';
import { EmptyState } from '../../components/ui/EmptyState';

export default function FavoritesPage() {
  const { t } = useLanguage();
  const { favorites } = useFavorites();
  const [favoriteProducts, setFavoriteProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let alive = true;
    async function loadFavorites() {
      setIsLoading(true);
      setHasError(false);
      try {
        const allProducts = await getProducts();
        if (alive) setFavoriteProducts(allProducts.filter((p) => favorites.includes(p.id)));
      } catch {
        if (alive) setHasError(true);
      } finally {
        if (alive) setIsLoading(false);
      }
    }
    loadFavorites();
    return () => {
      alive = false;
    };
  }, [favorites]);

  return (
    <div className="space-y-6 pb-16 font-arabic">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 text-ragab-ink-800 flex items-center gap-2">
          <Heart className="w-6 h-6 text-red-500 fill-current" />
          <span>{t.account.favorites}{!isLoading && ` (${favoriteProducts.length})`}</span>
        </h1>
      </div>

      {!isLoading && !hasError && favoriteProducts.length === 0 ? (
        <EmptyState
          icon={<Heart className="w-8 h-8 text-red-500" />}
          title="قائمة المفضلة فارغة"
          description="اضغط على أيقونة القلب على أي منتج لحفظه في قائمة مفضلاتك للوصول السريع مستقبلاً."
          actionLabel={t.cart.startShopping}
          actionHref="/categories"
        />
      ) : (
        <ProductGrid products={favoriteProducts} isLoading={isLoading} error={hasError} />
      )}
    </div>
  );
}
