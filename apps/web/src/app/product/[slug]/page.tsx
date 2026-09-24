'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Heart,
  ShoppingBag,
  Truck,
  ShieldCheck,
  Check,
  WifiOff,
  SearchX,
  RotateCcw,
  Trash2,
  Pencil,
  X,
  Loader2,
} from 'lucide-react';
import { cn } from '@ragab/utils';
import { useLanguage } from '../../../context/LanguageContext';
import { useAuth } from '../../../context/AuthContext';
import { useCart } from '../../../context/CartContext';
import { useFavorites } from '../../../context/FavoritesContext';
import { useToast } from '../../../components/ui/Toast';
import {
  getProductBySlug,
  getProducts,
  saveProduct,
  deleteProduct,
  updateStock,
} from '../../../services/productService';
import { getCategoryBySlug, getCategories } from '../../../services/categoryService';
import { addRecentlyViewed } from '../../../lib/recentlyViewed';
import { Product } from '../../../types';
import { Price } from '../../../components/ui/Price';
import { QuantitySelector } from '../../../components/ui/QuantitySelector';
import { Button } from '../../../components/ui/Button';
import { Rating } from '../../../components/ui/Rating';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ProductGrid } from '../../../components/product/ProductGrid';
import { ProductGallery } from '../../../components/product/ProductGallery';
import { SectionHeader } from '../../../components/ui/SectionHeader';

const measureLabels: Record<string, { ar: string; en: string }> = {
  L: { ar: 'لتر', en: 'L' },
  ml: { ar: 'مل', en: 'ml' },
  kg: { ar: 'كجم', en: 'kg' },
  g: { ar: 'جم', en: 'g' },
  pc: { ar: 'قطعة', en: 'pc' },
};

function ProductDetailSkeleton() {
  return (
    <div className="space-y-8 pb-16" aria-busy="true">
      <Skeleton className="h-4 w-64" />
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        <div className="md:col-span-6">
          <Skeleton className="w-full aspect-square rounded-3xl" />
        </div>
        <div className="md:col-span-6 space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export default function ProductDetailPage() {
  const { slug } = useParams();
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const { user, hasPermission, hasAnyAdminAccess } = useAuth();
  const { lineFor, addToCart, updateQuantity } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { showToast } = useToast();

  const isManager =
    Boolean(hasAnyAdminAccess) &&
    (user?.roleId === 'role_owner' ||
      user?.roleId === 'role_store_manager' ||
      (hasPermission('products', 'edit') && hasPermission('products', 'delete')));

  const [product, setProduct] = useState<Product | null>(null);
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [quantity, setQuantity] = useState(1);
  /** Chosen unit (piece / box / weight); null ⇒ the product's default unit. */
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Manager inline states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [isSavingPrice, setIsSavingPrice] = useState(false);
  const [isEditingStock, setIsEditingStock] = useState(false);
  const [stockInput, setStockInput] = useState('');
  const [isSavingStock, setIsSavingStock] = useState(false);
  const [isRemovingDiscount, setIsRemovingDiscount] = useState(false);

  useEffect(() => {
    if (showDeleteConfirm) {
      document.body.style.overflow = 'hidden';
      document.body.classList.add('has-modal-open');
    } else {
      document.body.style.overflow = '';
      document.body.classList.remove('has-modal-open');
    }
    return () => {
      document.body.style.overflow = '';
      document.body.classList.remove('has-modal-open');
    };
  }, [showDeleteConfirm]);

  const loadProduct = useCallback(async () => {
    if (typeof slug !== 'string') return;
    setIsLoading(true);
    setHasError(false);
    try {
      const prod = await getProductBySlug(slug);
      setProduct(prod);
      if (prod) {
        addRecentlyViewed(prod.id);
        const [related, category] = await Promise.all([
          getProducts({ categoryId: prod.categoryId }),
          getCategoryBySlug(prod.categoryId),
        ]);
        setRelatedProducts(related.filter((p) => p.id !== prod.id).slice(0, 5));
        setCategorySlug(category?.slug ?? prod.categoryId);
      }
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  if (isLoading) return <ProductDetailSkeleton />;

  if (hasError) {
    return (
      <EmptyState
        icon={<WifiOff className="w-8 h-8 text-ragab-danger" />}
        title={t.common.errorTitle}
        description={t.common.errorDesc}
        actionLabel={t.common.tryAgain}
        onAction={loadProduct}
      />
    );
  }

  if (!product) {
    return (
      <EmptyState
        icon={<SearchX className="w-8 h-8 text-ragab-brand-700" />}
        title={isRTL ? 'المنتج غير موجود' : 'Product not found'}
        description={isRTL ? 'ربما تم حذف المنتج أو تغيير رابطه.' : 'It may have been removed or its link changed.'}
        actionLabel={t.products.browseCategories}
        actionHref="/categories"
      />
    );
  }

  // The unit being bought: price, stock and cart line all follow it (0007).
  const activeVariants = (product.variants ?? []).filter((v) => v.isActive);
  const selected = activeVariants.find((v) => v.id === (selectedVariantId ?? product.defaultVariantId)) ?? activeVariants[0];
  const view = selected
    ? {
        price: selected.price,
        oldPrice: selected.oldPrice,
        inStock: selected.inStock,
        stockQuantity: selected.stockQuantity,
        unit: isRTL ? selected.unitAr ?? product.unitAr : selected.unitEn ?? product.unitEn,
        unitValue: selected.unitValue ?? product.unitValue,
        unitMeasure: selected.unitMeasure ?? product.unitMeasure,
      }
    : {
        price: product.price,
        oldPrice: product.oldPrice,
        inStock: product.inStock,
        stockQuantity: product.stockQuantity,
        unit: isRTL ? product.unitAr : product.unitEn,
        unitValue: product.unitValue,
        unitMeasure: product.unitMeasure,
      };
  const cartItem = lineFor(product.id, selected?.id);
  const favorited = isFavorite(product.id);

  const title = isRTL ? product.nameAr : product.nameEn || product.nameAr;
  const unit = view.unit;
  const categoryName = isRTL
    ? product.categoryNameAr
    : product.categoryNameEn || product.categoryNameAr;
  const description = isRTL ? product.descriptionAr : product.descriptionEn || product.descriptionAr;

  const galleryImages =
    product.images && product.images.length > 0 ? product.images : [product.image];

  const discountPct =
    view.oldPrice && view.oldPrice > view.price
      ? Math.round(((view.oldPrice - view.price) / view.oldPrice) * 100)
      : 0;

  const perUnit =
    view.unitValue && view.unitMeasure
      ? `${(view.price / view.unitValue).toFixed(2)} ${t.common.egp} / ${
          measureLabels[view.unitMeasure]?.[isRTL ? 'ar' : 'en'] ?? view.unitMeasure
        }`
      : undefined;

  const lowStockThreshold = product.lowStockThreshold ?? 5;
  const isLowStock =
    view.inStock && view.stockQuantity > 0 && view.stockQuantity <= lowStockThreshold;

  const handleAdd = () => {
    if (cartItem) {
      updateQuantity(product.id, Math.min(cartItem.quantity + quantity, view.stockQuantity), selected?.id);
    } else {
      addToCart(product, quantity, selected?.id);
    }
    showToast(t.common.addedToCart, 'success');
  };

  const handleDeleteProduct = async () => {
    if (!product) return;
    setIsDeleting(true);
    try {
      await deleteProduct(product.id);
      showToast(isRTL ? 'تم حذف المنتج بنجاح' : 'Product deleted successfully', 'success');

      // Cascade navigation rule:
      // 1. Same category
      const sameCatProducts = await getProducts({ categoryId: product.categoryId });
      const remainingInSameCat = sameCatProducts.filter((p) => p.id !== product.id);
      if (remainingInSameCat.length > 0) {
        router.push(`/product/${remainingInSameCat[0].slug}`);
        return;
      }

      // 2. Next categories
      const allCategories = await getCategories();
      const currentCatIndex = allCategories.findIndex(
        (c) => c.id === product.categoryId || c.slug === categorySlug,
      );
      const orderedCategories = [
        ...allCategories.slice(currentCatIndex + 1),
        ...allCategories.slice(0, currentCatIndex > 0 ? currentCatIndex : 0),
      ];

      for (const nextCat of orderedCategories) {
        const nextCatProducts = await getProducts({ categoryId: nextCat.id });
        const validNext = nextCatProducts.filter((p) => p.id !== product.id);
        if (validNext.length > 0) {
          router.push(`/product/${validNext[0].slug}`);
          return;
        }
      }

      // 3. Fallback to Home page
      router.push('/');
    } catch (err: any) {
      showToast(err?.message || (isRTL ? 'فشل حذف المنتج' : 'Failed to delete product'), 'error');
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleOpenPriceEdit = () => {
    setPriceInput(view.price.toString());
    setIsEditingPrice(true);
  };

  const handleSavePrice = async () => {
    if (!product) return;
    const newPrice = parseFloat(priceInput);
    if (isNaN(newPrice) || newPrice <= 0) {
      showToast(isRTL ? 'يرجى إدخال سعر صالح' : 'Please enter a valid price', 'error');
      return;
    }

    setIsSavingPrice(true);
    try {
      const hasVariants = (product.variants ?? []).length > 0;
      let updatedProduct: Product;

      if (hasVariants && selected) {
        const updatedVariants = (product.variants ?? []).map((v) => {
          if (v.id === selected.id) {
            const updatedOldPrice = v.oldPrice && v.oldPrice > newPrice ? v.oldPrice : undefined;
            return {
              ...v,
              price: newPrice,
              oldPrice: updatedOldPrice,
            };
          }
          return v;
        });

        const isDefault = selected.isDefault ?? (selected.id === product.defaultVariantId);
        const currentSelectedOldPrice = selected.oldPrice && selected.oldPrice > newPrice ? selected.oldPrice : undefined;

        updatedProduct = {
          ...product,
          price: isDefault ? newPrice : product.price,
          oldPrice: isDefault ? currentSelectedOldPrice : product.oldPrice,
          variants: updatedVariants,
        };
      } else {
        const updatedOldPrice = product.oldPrice && product.oldPrice > newPrice ? product.oldPrice : undefined;
        updatedProduct = {
          ...product,
          price: newPrice,
          oldPrice: updatedOldPrice,
        };
      }

      await saveProduct(updatedProduct);
      setProduct(updatedProduct);
      setIsEditingPrice(false);
      showToast(isRTL ? 'تم تحديث السعر بنجاح' : 'Price updated successfully', 'success');
    } catch (err: any) {
      showToast(err?.message || (isRTL ? 'فشل تحديث السعر' : 'Failed to update price'), 'error');
    } finally {
      setIsSavingPrice(false);
    }
  };

  const handleRemoveDiscount = async () => {
    if (!product) return;
    setIsRemovingDiscount(true);
    try {
      const hasVariants = (product.variants ?? []).length > 0;
      let updatedProduct: Product;

      if (hasVariants && selected) {
        const updatedVariants = (product.variants ?? []).map((v) => {
          if (v.id === selected.id) {
            return {
              ...v,
              oldPrice: undefined,
            };
          }
          return v;
        });

        const isDefault = selected.isDefault ?? (selected.id === product.defaultVariantId);
        updatedProduct = {
          ...product,
          oldPrice: isDefault ? undefined : product.oldPrice,
          variants: updatedVariants,
        };
      } else {
        updatedProduct = {
          ...product,
          oldPrice: undefined,
        };
      }

      await saveProduct(updatedProduct);
      setProduct(updatedProduct);
      showToast(isRTL ? 'تمت إزالة الخصم بنجاح' : 'Discount removed successfully', 'success');
    } catch (err: any) {
      showToast(err?.message || (isRTL ? 'فشل إزالة الخصم' : 'Failed to remove discount'), 'error');
    } finally {
      setIsRemovingDiscount(false);
    }
  };

  const handleOpenStockEdit = () => {
    setStockInput(view.stockQuantity.toString());
    setIsEditingStock(true);
  };

  const handleSaveStock = async () => {
    if (!product) return;
    const newQty = parseInt(stockInput, 10);
    if (isNaN(newQty) || newQty < 0) {
      showToast(isRTL ? 'يرجى إدخال كمية صحيحة' : 'Please enter a valid stock count', 'error');
      return;
    }

    setIsSavingStock(true);
    try {
      await updateStock(product.id, newQty, undefined, selected?.id);

      const hasVariants = (product.variants ?? []).length > 0;
      let updatedProduct: Product;

      if (hasVariants && selected) {
        const updatedVariants = (product.variants ?? []).map((v) => {
          if (v.id === selected.id) {
            return {
              ...v,
              stockQuantity: newQty,
              inStock: newQty > 0,
            };
          }
          return v;
        });

        const isDefault = selected.isDefault ?? (selected.id === product.defaultVariantId);
        updatedProduct = {
          ...product,
          stockQuantity: isDefault ? newQty : product.stockQuantity,
          inStock: updatedVariants.some((v) => v.inStock),
          variants: updatedVariants,
        };
      } else {
        updatedProduct = {
          ...product,
          stockQuantity: newQty,
          inStock: newQty > 0,
        };
      }

      setProduct(updatedProduct);
      setIsEditingStock(false);
      showToast(isRTL ? 'تم تحديث المخزون بنجاح' : 'Stock updated successfully', 'success');
    } catch (err: any) {
      showToast(err?.message || (isRTL ? 'فشل تحديث المخزون' : 'Failed to update stock'), 'error');
    } finally {
      setIsSavingStock(false);
    }
  };

  return (
    <div className="space-y-8 pb-24 md:pb-16 font-arabic">
      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="flex items-center gap-2 text-caption font-semibold text-ragab-ink-500">
        <Link href="/" className="hover:text-ragab-ink-800 transition-colors">
          {t.navigation.home}
        </Link>
        <span>/</span>
        <Link
          href={`/category/${categorySlug ?? product.categoryId}`}
          className="hover:text-ragab-ink-800 transition-colors"
        >
          {categoryName}
        </Link>
              </nav>

      {/* ===== Main section ===== */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-12 items-start">
        {/* Gallery */}
        <div className="md:col-span-6">
          <ProductGallery images={galleryImages} alt={title} discountPercentage={discountPct} />
        </div>

                {/* Info — sticky on large screens */}
        <div className="md:col-span-6 space-y-5 lg:sticky lg:top-40">
          {/* Brand → name → rating */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                {product.brandAr && (
                  <p className="text-caption font-bold text-ragab-ink-500">
                    {isRTL ? product.brandAr : product.brandEn || product.brandAr}
                  </p>
                )}
                <h1 className="text-h1 md:text-3xl text-ragab-ink-900 leading-tight font-extrabold">{title}</h1>
              </div>

              {/* Red button for deleting product */}
              {isManager && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  title={isRTL ? 'إزالة المنتج بكل كمياته' : 'Delete product'}
                  className="shrink-0 h-10 px-3.5 rounded-xl bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 hover:border-red-600 transition-colors font-bold text-caption inline-flex items-center gap-1.5 shadow-sm focus-ring"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isRTL ? 'إزالة المنتج' : 'Delete'}</span>
                </button>
              )}
            </div>
            {product.rating !== undefined && (
              <Rating value={product.rating} reviewCount={product.reviewCount} size="md" />
            )}
          </div>

          {/* Packaging — piece / box / weight (only when the product has more than one unit) */}
          {activeVariants.length > 1 && (
            <div className="space-y-2">
              <p className="text-label text-ragab-ink-700">{t.products.choosePackaging}</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.products.choosePackaging}>
                {activeVariants.map((v) => {
                  const on = v.id === selected?.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={!v.inStock}
                      onClick={() => {
                        setSelectedVariantId(v.id);
                        setQuantity(1);
                        setIsEditingPrice(false);
                        setIsEditingStock(false);
                      }}
                      className={cn(
                                            'px-4 h-10 rounded-full border text-body-sm font-bold focus-ring transition-colors',
                    on ? 'bg-ragab-cream border-ragab-brand-500 text-ragab-ink-900' : 'bg-white border-ragab-ink-200 text-ragab-ink-700 hover:border-ragab-brand-400',
                        !v.inStock && 'opacity-50 line-through cursor-not-allowed'
                      )}
                    >
                      {isRTL ? v.nameAr : v.nameEn || v.nameAr} · {v.price} {t.common.egp}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

                    {/* Price */}
          <div className="flex items-baseline gap-3 flex-wrap">
            {isEditingPrice ? (
              <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-xl border border-ragab-brand-400 shadow-card">
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  className="w-24 h-9 px-2 text-body font-bold border border-ragab-ink-200 rounded-lg focus:outline-none focus:border-ragab-brand-500"
                  autoFocus
                />
                <span className="text-caption font-bold text-ragab-ink-600">{t.common.egp}</span>
                <button
                  type="button"
                  onClick={handleSavePrice}
                  disabled={isSavingPrice}
                  title={isRTL ? 'حفظ السعر' : 'Save price'}
                  className="h-9 px-3 rounded-lg bg-ragab-brand-500 hover:bg-ragab-brand-600 text-ragab-ink-800 font-bold text-caption flex items-center justify-center transition-colors"
                >
                  {isSavingPrice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingPrice(false)}
                  title={isRTL ? 'إلغاء' : 'Cancel'}
                  className="h-9 px-2 rounded-lg bg-ragab-ink-100 hover:bg-ragab-ink-200 text-ragab-ink-600 font-bold text-caption transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-3xl md:text-4xl font-extrabold text-ragab-ink-900 tabular-nums">
                  {view.price.toFixed(2)}{' '}
                  <span className="text-body font-bold text-ragab-ink-600">{t.common.egp}</span>
                </span>
                {/* Yellow button for editing price */}
                {isManager && (
                  <button
                    type="button"
                    onClick={handleOpenPriceEdit}
                    title={isRTL ? 'تعديل السعر للعبوة/الوحدة المحددة' : 'Edit unit/package price'}
                    className="p-1.5 rounded-lg bg-ragab-ink-100 hover:bg-ragab-ink-200 text-ragab-ink-700 border border-ragab-ink-200 transition-colors inline-flex items-center justify-center focus-ring shadow-sm"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* Old Price & Grey button for removing discount */}
            {view.oldPrice && view.oldPrice > view.price ? (
              <div className="flex items-center gap-1.5">
                <span className="text-body text-ragab-ink-400 line-through tabular-nums">
                  {view.oldPrice.toFixed(2)} {t.common.egp}
                </span>
                {isManager && (
                  <button
                    type="button"
                    onClick={handleRemoveDiscount}
                    disabled={isRemovingDiscount}
                    title={isRTL ? 'إزالة الخصم' : 'Remove discount'}
                    className="px-2 py-0.5 rounded bg-ragab-ink-100 hover:bg-ragab-ink-200 text-ragab-ink-600 hover:text-ragab-ink-900 border border-ragab-ink-200 transition-colors text-xs font-bold inline-flex items-center gap-1 focus-ring"
                  >
                    {isRemovingDiscount ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <>
                        <X className="w-3 h-3" />
                        <span>{isRTL ? 'إلغاء الخصم' : 'Remove discount'}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            ) : null}

            <span className="text-body-sm text-ragab-ink-500">/ {unit}</span>
            {perUnit && <span className="text-caption text-ragab-ink-500 basis-full">{perUnit}</span>}
          </div>

          {/* Availability */}
          <div className="flex items-center gap-3 flex-wrap text-body-sm font-semibold">
            {view.inStock ? (
              <span className="inline-flex items-center gap-1.5 text-ragab-success bg-ragab-success-soft px-2.5 py-1 rounded-md border border-emerald-200">
                <Check className="w-4 h-4" />
                {t.common.inStock}
              </span>
            ) : (
              <span className="text-ragab-danger bg-ragab-danger-soft px-2.5 py-1 rounded-md border border-red-200">
                {t.common.outOfStock}
              </span>
            )}
            {isLowStock && (
              <span className="text-ragab-warning font-bold">
                {t.common.lowStock.replace('{count}', String(view.stockQuantity))}
              </span>
            )}

            {/* Manager Stock Adjuster */}
            {isManager && (
              isEditingStock ? (
                <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-ragab-brand-400 shadow-sm">
                  <span className="text-caption font-bold text-ragab-ink-600 px-1">{isRTL ? 'المخزون:' : 'Stock:'}</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={stockInput}
                    onChange={(e) => setStockInput(e.target.value)}
                    className="w-16 h-7 px-1.5 text-caption font-bold border border-ragab-ink-200 rounded focus:outline-none focus:border-ragab-brand-500"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveStock}
                    disabled={isSavingStock}
                    title={isRTL ? 'حفظ المخزون' : 'Save stock'}
                    className="h-7 px-2 rounded bg-ragab-brand-500 hover:bg-ragab-brand-600 text-ragab-ink-800 font-bold text-caption flex items-center justify-center transition-colors"
                  >
                    {isSavingStock ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingStock(false)}
                    title={isRTL ? 'إلغاء' : 'Cancel'}
                    className="h-7 px-1.5 rounded bg-ragab-ink-100 hover:bg-ragab-ink-200 text-ragab-ink-600 font-bold text-caption transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenStockEdit}
                  title={isRTL ? 'تعديل كمية المخزون في المتجر' : 'Edit stock in store'}
                  className="px-2.5 py-1 rounded-md bg-ragab-brand-50 hover:bg-ragab-brand-100 text-ragab-brand-800 border border-ragab-brand-300 font-bold text-caption inline-flex items-center gap-1.5 transition-colors focus-ring"
                >
                  <Pencil className="w-3 h-3" />
                  <span>{isRTL ? `المخزون: ${view.stockQuantity}` : `Stock: ${view.stockQuantity}`}</span>
                </button>
              )
            )}
          </div>

                    {/* Description */}
          <p className="text-body text-ragab-ink-600 leading-relaxed max-w-xl">{description}</p>

          {/* Actions */}
          {view.inStock && (
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <QuantitySelector
                quantity={quantity}
                onIncrease={() => setQuantity((q) => Math.min(q + 1, view.stockQuantity))}
                onDecrease={() => setQuantity((q) => Math.max(1, q - 1))}
                max={view.stockQuantity}
                size="lg"
              />

              <Button
                variant="primary"
                size="lg"
                onClick={handleAdd}
                                className="flex-1 min-w-[180px] h-14 rounded-2xl text-base"
              >
                <ShoppingBag className="w-5 h-5" />
                <span>{t.common.addToCart}</span>
                {cartItem && (
                  <span className="text-caption font-bold bg-ragab-ink-800/10 rounded-full px-2 py-0.5">
                    {cartItem.quantity} ✓
                  </span>
                )}
              </Button>

              <button
                onClick={() => toggleFavorite(product.id)}
                aria-label={favorited ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                aria-pressed={favorited}
                className={cn(
                                    'w-14 h-14 flex items-center justify-center rounded-2xl border transition-colors focus-ring',
                  favorited
                    ? 'bg-ragab-danger-soft text-ragab-danger border-red-200'
                    : 'bg-white text-ragab-ink-500 border-ragab-ink-200 hover:bg-ragab-ink-50'
                )}
              >
                <Heart className={cn('w-5 h-5', favorited && 'fill-current')} />
              </button>
            </div>
          )}

          {/* Delivery & guarantee */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 text-body-sm font-semibold text-ragab-ink-600 border-t border-ragab-ink-100">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-ragab-brand-700 shrink-0" />
              <span>{isRTL ? 'توصيل خلال 30 دقيقة في عليم' : 'Delivery within 30 min in Aleem'}</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-ragab-brand-700 shrink-0" />
              <span>{isRTL ? 'جودة مضمونة 100%' : '100% quality guaranteed'}</span>
            </div>
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-ragab-brand-700 shrink-0" />
              <span>{isRTL ? 'استبدال فوري لأي منتج تالف' : 'Instant replacement for damaged items'}</span>
            </div>
          </div>
        </div>
      </div>

            {/* ===== Specs ===== */}
      <div className="bg-white rounded-2xl border border-ragab-ink-200 shadow-subtle max-w-3xl">
        <h2 className="text-h3 text-ragab-ink-800 px-5 pt-5 pb-3">{t.products.productInformation}</h2>
        <dl className="divide-y divide-ragab-ink-100 text-body-sm">
          {[
            [t.products.sizeUnit, unit],
            [t.products.brand, product.brandAr ? (isRTL ? product.brandAr : product.brandEn || product.brandAr) : null],
            [t.products.category, categoryName],
            [isRTL ? 'بلد المنشأ' : 'Origin', product.originAr || (isRTL ? 'مصر' : 'Egypt')],
          ]
            .filter(([, v]) => !!v)
            .map(([k, v]) => (
              <div key={String(k)} className="flex items-center justify-between gap-4 px-5 py-3">
                <dt className="text-ragab-ink-500">{k}</dt>
                <dd className="font-bold text-ragab-ink-800 text-end">{v}</dd>
              </div>
            ))}
        </dl>

                {product.nutritionFactsAr && product.nutritionFactsAr.length > 0 && (
          <div className="px-5 pb-5 pt-3 border-t border-ragab-ink-100">
            <h3 className="text-label text-ragab-ink-800 mb-2">
              {isRTL ? 'القيمة الغذائية' : 'Nutrition facts'}
            </h3>
            <ul className="list-disc ps-5 text-body-sm text-ragab-ink-600 space-y-1">
              {product.nutritionFactsAr.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ===== Related ===== */}
      {relatedProducts.length > 0 && (
                <div>
          <SectionHeader title={t.products.relatedProducts} actionHref={`/category/${categorySlug ?? product.categoryId}`} />
          <ProductGrid products={relatedProducts.slice(0, 4)} showCategory={false} />
        </div>
      )}

      {/* ===== Mobile sticky CTA — sits above the bottom nav ===== */}
      {product.inStock && (
        <div
          className="mobile-sticky-cta md:hidden fixed inset-x-0 z-30 bg-white border-t border-ragab-ink-200 p-3 shadow-sticky flex items-center justify-between gap-3 transition-all duration-200"
          style={{ bottom: 'calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))' }}
        >
          <Price price={product.price} oldPrice={product.oldPrice} size="md" />
          <Button variant="primary" size="md" onClick={handleAdd} className="flex-1 max-w-[220px]">
            <ShoppingBag className="w-4 h-4" />
            <span>{t.common.addToCart}</span>
          </Button>
        </div>
      )}

      {/* Delete confirmation modal for Manager/Owner */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 font-arabic"
          role="dialog"
          aria-modal="true"
          data-modal-open="true"
          onClick={() => !isDeleting && setShowDeleteConfirm(false)}
        >
          <div
            className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-ragab-ink-100 text-center space-y-4 animate-in fade-in zoom-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-100">
              <Trash2 className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="font-extrabold text-h2 text-ragab-ink-900">
                {isRTL ? 'إزالة المنتج بكل كمياته؟' : 'Remove this product?'}
              </h3>
              <p className="text-body-sm text-ragab-ink-500 leading-normal">
                {isRTL
                  ? 'سيتم حذف المنتج نهائياً من المتجر وإعادة توجيهك إلى المنتجات الأخرى المتاحة.'
                  : 'This will permanently remove the product and redirect you to other available products.'}
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteProduct}
                className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-body-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>{isRTL ? 'نعم، احذف المنتج' : 'Delete product'}</span>
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 h-12 rounded-xl bg-ragab-ink-100 hover:bg-ragab-ink-200 text-ragab-ink-800 font-bold text-body-sm transition-colors"
              >
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
