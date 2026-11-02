'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@ragab/utils';
import { CartItem } from '../../types';
import { useCart } from '../../context/CartContext';
import { useLanguage } from '../../context/LanguageContext';
import { QuantitySelector } from '../ui/QuantitySelector';

interface CartLineItemProps {
  item: CartItem;
  /** 'compact' for the drawer, 'full' for the cart page */
  variant?: 'compact' | 'full';
  onNavigate?: () => void;
}

/** Single cart row — shared by the cart page and the cart drawer. */
export const CartLineItem: React.FC<CartLineItemProps> = ({
  item,
  variant = 'full',
  onNavigate,
}) => {
  const { product, quantity, variantId, variant: unitVariant, unitPrice } = item;
  const { t, isRTL } = useLanguage();
  const { updateQuantity } = useCart();

  const name = isRTL ? product.nameAr : product.nameEn || product.nameAr;
  // A non-default unit (box / weight) is named on the line; the plain unit shows the product unit.
  const packaging = unitVariant && !unitVariant.isDefault ? (isRTL ? unitVariant.nameAr : unitVariant.nameEn || unitVariant.nameAr) : null;
  const unit = packaging ?? (isRTL ? product.unitAr : product.unitEn);
  const price = unitPrice ?? unitVariant?.price ?? product.price;
  const max = product.variants?.find((v) => v.id === variantId)?.stockQuantity ?? product.stockQuantity;
  const isCompact = variant === 'compact';

  return (
    <div className={cn('flex gap-2.5 xs:gap-3 items-center', isCompact ? 'py-3' : 'py-3.5 sm:py-4 gap-3 sm:gap-4')}>
      {/* Image */}
      <Link
        href={`/product/${product.slug}`}
        onClick={onNavigate}
        className={cn(
          'relative rounded-lg bg-ragab-ink-50 flex-shrink-0 border border-ragab-ink-100 overflow-hidden focus-ring',
          isCompact ? 'w-14 h-14' : 'w-16 h-16 sm:w-20 sm:h-20'
        )}
      >
        <Image
          src={product.image}
          alt={name}
          fill
          sizes={isCompact ? '56px' : '(max-width: 640px) 64px, 80px'}
          className="object-contain p-1 xs:p-1.5"
        />
      </Link>

      {/* Name / unit / line total */}
      <div className="flex-1 min-w-0 font-arabic">
        <Link
          href={`/product/${product.slug}`}
          onClick={onNavigate}
          className="block focus-ring rounded-md"
        >
          <h4
            className={cn(
              'font-bold text-ragab-ink-800 hover:text-ragab-brand-700 transition-colors',
              isCompact ? 'text-caption xs:text-body-sm truncate' : 'text-caption xs:text-body-sm line-clamp-2'
            )}
          >
            {name}
          </h4>
        </Link>
        <div className={cn('text-[11px] xs:text-caption mt-0.5', packaging ? 'font-bold text-ragab-brand-700' : 'text-ragab-ink-500')}>{unit}</div>
        <div className="mt-1 text-caption xs:text-body-sm font-extrabold text-ragab-ink-800">
          {(price * quantity).toFixed(2)}{' '}
          <span className="text-[11px] xs:text-caption font-semibold text-ragab-ink-500">{t.common.egp}</span>
          {quantity > 1 && (
            <span className="text-[10px] xs:text-caption font-medium text-ragab-ink-500 ms-1">
              ({price.toFixed(2)} × {quantity})
            </span>
          )}
        </div>
      </div>

      {/* Quantity — capped at the unit's real stock */}
      <div className="shrink-0">
        <QuantitySelector
          quantity={quantity}
          onIncrease={() => updateQuantity(product.id, quantity + 1, variantId)}
          onDecrease={() => updateQuantity(product.id, quantity - 1, variantId)}
          max={max}
          allowDelete
          size="sm"
        />
      </div>
    </div>
  );
};
