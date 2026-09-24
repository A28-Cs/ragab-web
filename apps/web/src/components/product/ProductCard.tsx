'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Heart, Plus, Trash2, Pencil, X, Check, Loader2 } from 'lucide-react';
import { cn } from '@ragab/utils';
import { Product } from '../../types';
import { useCart } from '../../context/CartContext';
import { useFavorites } from '../../context/FavoritesContext';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { saveProduct, deleteProduct } from '../../services/productService';
import { useToast } from '../ui/Toast';
import { Badge } from '../ui/Badge';
import { Rating } from '../ui/Rating';

interface ProductCardProps {
  product: Product;
  showCategory?: boolean;
}

const ProductCardInner: React.FC<ProductCardProps> = ({ product, showCategory = true }) => {
  const { t, isRTL } = useLanguage();
  const { user, hasPermission, hasAnyAdminAccess } = useAuth();
  const { lineFor, addToCart } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { showToast } = useToast();
  const [selectedVariantId, setSelectedVariantId] = React.useState<string | null>(null);

  // Quick admin permissions: store manager, owner, or users with product edit/delete permissions
  const isManager =
    Boolean(hasAnyAdminAccess) &&
    (user?.roleId === 'role_owner' ||
      user?.roleId === 'role_store_manager' ||
      (hasPermission('products', 'edit') && hasPermission('products', 'delete')));

  // Local state for live updates without full page reloads
  const [isDeleted, setIsDeleted] = React.useState(false);
  const [currentPrice, setCurrentPrice] = React.useState<number | null>(null);
  const [currentOldPrice, setCurrentOldPrice] = React.useState<number | null | undefined>(undefined);
  const [isEditingPrice, setIsEditingPrice] = React.useState(false);
  const [priceInput, setPriceInput] = React.useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);

  const activeVariants = (product.variants ?? []).filter((v) => v.isActive);
  const selected =
    activeVariants.find((v) => v.id === (selectedVariantId ?? product.defaultVariantId)) ??
    activeVariants[0];

  const view = selected
    ? {
        price: selected.price,
        oldPrice: selected.oldPrice,
        inStock: selected.inStock,
        stockQuantity: selected.stockQuantity,
        unit: isRTL ? selected.unitAr ?? product.unitAr : selected.unitEn ?? product.unitEn,
      }
    : {
        price: product.price,
        oldPrice: product.oldPrice,
        inStock: product.inStock,
        stockQuantity: product.stockQuantity,
        unit: isRTL ? product.unitAr : product.unitEn,
      };

  const cartItem = lineFor(product.id, selected?.id);
  const inCart = cartItem?.quantity ?? 0;
  const atMax = inCart >= view.stockQuantity;
  const favorited = isFavorite(product.id);

  const title = isRTL ? product.nameAr : product.nameEn || product.nameAr;
  const categoryName = isRTL
    ? product.categoryNameAr
    : product.categoryNameEn || product.categoryNameAr;
  const lowStockThreshold = product.lowStockThreshold ?? 5;
  const isLowStock =
    view.inStock && view.stockQuantity > 0 && view.stockQuantity <= lowStockThreshold;
  const effectivePrice = currentPrice !== null ? currentPrice : view.price;
  const effectiveOldPrice =
    currentOldPrice !== undefined ? (currentOldPrice ?? undefined) : view.oldPrice;

  const discountPct =
    effectiveOldPrice && effectiveOldPrice > effectivePrice
      ? Math.round(((effectiveOldPrice - effectivePrice) / effectiveOldPrice) * 100)
      : 0;

  const handleAdd = () => {
    addToCart(product, 1, selected?.id);
    showToast(t.common.addedToCart, 'success');
  };

  const handleDeleteProduct = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActionLoading(true);
    try {
      await deleteProduct(product.id);
      setIsDeleted(true);
      showToast(isRTL ? 'تمت إزالة المنتج بنجاح' : 'Product removed successfully', 'success');
    } catch (err: any) {
      showToast(err?.message || (isRTL ? 'فشل إزالة المنتج' : 'Failed to delete product'), 'error');
    } finally {
      setActionLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleOpenPriceEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPriceInput(effectivePrice.toString());
    setIsEditingPrice(true);
  };

  const handleSavePrice = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newPrice = parseFloat(priceInput);
    if (isNaN(newPrice) || newPrice <= 0) {
      showToast(isRTL ? 'يرجى إدخال سعر صالح' : 'Please enter a valid price', 'error');
      return;
    }
    setActionLoading(true);
    try {
      const updatedOldPrice =
        effectiveOldPrice && effectiveOldPrice > newPrice ? effectiveOldPrice : undefined;
      await saveProduct({
        ...product,
        price: newPrice,
        oldPrice: updatedOldPrice,
      });
      setCurrentPrice(newPrice);
      if (updatedOldPrice !== effectiveOldPrice) {
        setCurrentOldPrice(updatedOldPrice);
      }
      setIsEditingPrice(false);
      showToast(isRTL ? 'تم تحديث السعر بنجاح' : 'Price updated successfully', 'success');
    } catch (err: any) {
      showToast(err?.message || (isRTL ? 'فشل تحديث السعر' : 'Failed to update price'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveDiscount = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActionLoading(true);
    try {
      await saveProduct({
        ...product,
        price: effectivePrice,
        oldPrice: undefined,
      });
      setCurrentOldPrice(null);
      showToast(isRTL ? 'تمت إزالة الخصم بنجاح' : 'Discount removed successfully', 'success');
    } catch (err: any) {
      showToast(err?.message || (isRTL ? 'فشل إزالة الخصم' : 'Failed to remove discount'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (isDeleted) return null;

  return (
    <article
      className={cn(
        'group relative bg-white rounded-2xl border border-ragab-ink-200 overflow-hidden transition-all duration-200 flex flex-col',
        view.inStock ? 'hover:shadow-card-hover hover:-translate-y-0.5' : ''
      )}
    >
      {/* Single stretched link — the whole card is one click target */}
      <Link
        href={`/product/${product.slug}`}
        className="absolute inset-0 z-0 rounded-2xl focus-ring"
        aria-label={title}
      />

      {/* Media */}
      <div className="relative w-full aspect-square bg-ragab-surface-sunken pointer-events-none">
        <Image
          src={product.image}
          alt=""
          fill
          sizes="(max-width: 640px) 45vw, (max-width: 768px) 30vw, (max-width: 1280px) 22vw, 18vw"
          className={cn(
            'object-contain p-5 transition-transform duration-300',
            view.inStock ? 'group-hover:scale-105' : 'opacity-60 grayscale-[30%]'
          )}
        />
      </div>

      {/* Status badge — top-start over the media */}
      <div className="absolute top-3 start-3 z-10 pointer-events-none">
        {!view.inStock ? (
          <Badge variant="dark">{t.common.unavailable}</Badge>
        ) : discountPct > 0 ? (
          <Badge variant="discount">
            {isRTL ? `${t.common.discount} ${discountPct}%` : `${discountPct}% ${t.common.discount}`}
          </Badge>
        ) : isLowStock ? (
          <Badge variant="warning">
            {t.common.lastPieces.replace('{count}', String(view.stockQuantity))}
          </Badge>
        ) : product.isNew ? (
          <Badge variant="promo">{t.common.newBadge}</Badge>
        ) : null}
      </div>

      {/* Favorite — top-end, 44px touch target */}
      <button
        type="button"
        onClick={() => toggleFavorite(product.id)}
        aria-label={favorited ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
        aria-pressed={favorited}
        className={cn(
          'absolute top-1.5 end-1.5 z-10 touch-target flex items-center justify-center rounded-full transition-colors focus-ring',
          favorited ? 'text-ragab-danger' : 'text-ragab-ink-700 hover:text-ragab-danger'
        )}
      >
        <span
          className={cn(
            'w-9 h-9 rounded-full flex items-center justify-center shadow-card border border-ragab-ink-100 transition-colors',
            favorited ? 'bg-ragab-danger-soft' : 'bg-white'
          )}
        >
          <Heart className={cn('w-4 h-4', favorited && 'fill-current')} />
        </span>
      </button>

      {/* Body */}
      <div className="flex-1 flex flex-col p-4 pointer-events-none font-arabic">
        <h3 className="text-body font-bold text-ragab-ink-800 line-clamp-2 leading-snug min-h-[2.6em]">
          {title}
        </h3>

        <p className="text-caption text-ragab-ink-500 mt-1 truncate">
          <span>{view.unit}</span>
          {showCategory && categoryName && (
            <>
              <span className="mx-1.5 text-ragab-ink-300">·</span>
              <span>{categoryName}</span>
            </>
          )}
        </p>

        <div className="min-h-[1.25rem] mt-2">
          {product.rating !== undefined && (
            <Rating value={product.rating} reviewCount={product.reviewCount} size="sm" />
          )}
        </div>

        {activeVariants.length > 1 && (
          <div className="relative z-10 pointer-events-auto mt-3">
            <select
              value={selected?.id}
              onChange={(e) => setSelectedVariantId(e.target.value)}
              aria-label={t.products.choosePackaging}
              className="w-full h-9 rounded-lg border border-ragab-ink-200 bg-white px-2 text-caption font-bold text-ragab-ink-800 focus-ring"
            >
              {activeVariants.map((v) => (
                <option key={v.id} value={v.id} disabled={!v.inStock}>
                  {isRTL ? v.nameAr : v.nameEn || v.nameAr} — {v.price} {t.common.egp}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Price + action — stacked (full-width button) on narrow 2-column mobile
            cards where the two never fit on one line without overlapping; back
            to a single row, price start / button end, from `sm:` up. */}
        <div className="mt-auto pt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 leading-tight">
            {isEditingPrice ? (
              <div
                className="relative z-20 pointer-events-auto flex items-center gap-1 bg-white p-1 rounded-lg border border-ragab-brand-400 shadow-card my-1"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  className="w-16 h-7 px-1.5 text-caption font-bold border border-ragab-ink-200 rounded focus:outline-none focus:border-ragab-brand-500"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSavePrice}
                  disabled={actionLoading}
                  title={isRTL ? 'حفظ السعر' : 'Save price'}
                  className="h-7 px-2 rounded bg-ragab-brand-500 hover:bg-ragab-brand-600 text-ragab-ink-800 font-bold text-caption flex items-center justify-center transition-colors"
                >
                  {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsEditingPrice(false);
                  }}
                  title={isRTL ? 'إلغاء' : 'Cancel'}
                  className="h-7 px-1.5 rounded bg-ragab-ink-100 hover:bg-ragab-ink-200 text-ragab-ink-600 font-bold text-caption transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="text-price-lg text-ragab-ink-800 tabular-nums">
                  {effectivePrice.toFixed(2)}{' '}
                  <span className="text-caption font-bold text-ragab-ink-600">{t.common.egp}</span>
                </div>
                {/* Yellow button for editing price */}
                {isManager && (
                  <button
                    type="button"
                    onClick={handleOpenPriceEdit}
                    title={isRTL ? 'تعديل السعر' : 'Edit price'}
                    aria-label={isRTL ? 'تعديل السعر' : 'Edit price'}
                    className="relative z-10 pointer-events-auto p-1.5 rounded-lg bg-ragab-ink-100 hover:bg-ragab-ink-200 text-ragab-ink-700 border border-ragab-ink-200 transition-colors inline-flex items-center justify-center focus-ring shadow-sm"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Old Price & Grey button for removing discount */}
            {effectiveOldPrice && effectiveOldPrice > effectivePrice ? (
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-caption text-ragab-ink-400 line-through tabular-nums">
                  {effectiveOldPrice.toFixed(2)} {t.common.egp}
                </span>
                {isManager && (
                  <button
                    type="button"
                    onClick={handleRemoveDiscount}
                    disabled={actionLoading}
                    title={isRTL ? 'إزالة الخصم' : 'Remove discount'}
                    aria-label={isRTL ? 'إزالة الخصم' : 'Remove discount'}
                    className="relative z-10 pointer-events-auto px-1.5 py-0.5 rounded bg-ragab-ink-100 hover:bg-ragab-ink-200 text-ragab-ink-600 hover:text-ragab-ink-900 border border-ragab-ink-200 transition-colors text-[11px] font-bold inline-flex items-center gap-0.5 focus-ring"
                  >
                    {actionLoading ? (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    ) : (
                      <>
                        <X className="w-2.5 h-2.5" />
                        <span>{isRTL ? 'إلغاء الخصم' : 'Remove discount'}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            ) : null}
          </div>

          <div className="relative z-10 pointer-events-auto sm:shrink-0 flex flex-col gap-1.5 items-end">
            {/* Red button for removing product */}
            {isManager && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowDeleteConfirm(true);
                }}
                title={isRTL ? 'إزالة المنتج بكل كمياته' : 'Delete product'}
                aria-label={isRTL ? 'إزالة المنتج بكل كمياته' : 'Delete product'}
                className="h-7 w-full sm:w-auto px-2 rounded-lg bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 hover:border-red-600 transition-colors font-bold text-[11px] inline-flex items-center justify-center gap-1 shadow-sm focus-ring"
              >
                <Trash2 className="w-3 h-3" />
                <span>{isRTL ? 'إزالة المنتج' : 'Delete'}</span>
              </button>
            )}

            {view.inStock ? (
              <button
                type="button"
                onClick={handleAdd}
                disabled={atMax}
                aria-label={t.common.addToCart}
                className={cn(
                  'h-10 w-full sm:w-auto px-3.5 rounded-xl font-bold text-body-sm inline-flex items-center justify-center gap-1.5 transition-all focus-ring',
                  atMax
                    ? 'bg-ragab-ink-100 text-ragab-ink-500 cursor-not-allowed'
                    : 'bg-ragab-brand-500 hover:bg-ragab-brand-600 text-white shadow-[0_6px_16px_-6px_rgba(20,184,166,0.6)] active:scale-[0.97]'
                )}
              >
                <Plus className="w-4 h-4" />
                <span>{t.common.add}</span>
              </button>
            ) : (
              <span className="h-10 w-full sm:w-auto px-3.5 rounded-xl bg-ragab-ink-100 text-ragab-ink-500 font-bold text-caption inline-flex items-center justify-center">
                {t.common.soldOut}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Overlay for Store Manager / Owner */}
      {showDeleteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          data-modal-open="true"
          className="absolute inset-0 z-30 bg-white/95 backdrop-blur-sm p-4 rounded-2xl flex flex-col items-center justify-center text-center pointer-events-auto border-2 border-red-500 shadow-xl animate-in fade-in zoom-in duration-150 font-arabic"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-2">
            <Trash2 className="w-5 h-5" />
          </div>
          <p className="font-bold text-body-sm text-ragab-ink-800 mb-1">
            {isRTL ? 'إزالة المنتج بكل كمياته؟' : 'Remove this product?'}
          </p>
          <p className="text-caption text-ragab-ink-500 mb-4 px-2">
            {isRTL ? 'سيتم إخفاء المنتج وجميع كمياته من المتجر نهائياً.' : 'This will remove the product and its stock from the store.'}
          </p>
          <div className="flex items-center gap-2 w-full max-w-[200px]">
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleDeleteProduct}
              className="flex-1 h-9 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-caption flex items-center justify-center gap-1 shadow-sm transition-colors"
            >
              {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (isRTL ? 'نعم، حذف' : 'Delete')}
            </button>
            <button
              type="button"
              disabled={actionLoading}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowDeleteConfirm(false);
              }}
              className="flex-1 h-9 rounded-xl bg-ragab-ink-100 hover:bg-ragab-ink-200 text-ragab-ink-700 font-bold text-caption flex items-center justify-center transition-colors"
            >
              {isRTL ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </article>
  );
};

export const ProductCard = React.memo(ProductCardInner, (prev, next) => {
  // Re-render only when the product data actually changes
  return (
    prev.product.id === next.product.id &&
    prev.product.price === next.product.price &&
    prev.product.oldPrice === next.product.oldPrice &&
    prev.product.stockQuantity === next.product.stockQuantity &&
    prev.product.image === next.product.image &&
    prev.showCategory === next.showCategory
  );
});
