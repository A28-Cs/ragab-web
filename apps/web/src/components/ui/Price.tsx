'use client';

import React from 'react';
import { cn } from '@ragab/utils';
import { useLanguage } from '../../context/LanguageContext';

interface PriceProps {
  price: number;
  oldPrice?: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSavings?: boolean;
  /** e.g. "63.33 ج.م / لتر" — computed by the caller from unitValue/unitMeasure */
  perUnit?: string;
  className?: string;
}

const fontSizes = {
  sm: 'text-body-sm font-bold',
  md: 'text-price',
  lg: 'text-price-lg',
  xl: 'text-h1',
};

const oldFontSizes = {
  sm: 'text-caption',
  md: 'text-body-sm',
  lg: 'text-body-sm',
  xl: 'text-body',
};

export const Price: React.FC<PriceProps> = ({
  price,
  oldPrice,
  size = 'md',
  showSavings = false,
  perUnit,
  className = '',
}) => {
  const { t } = useLanguage();

  const hasDiscount = !!oldPrice && oldPrice > price;
  const savingsAmount = hasDiscount ? (oldPrice - price).toFixed(2) : null;

  return (
    <div className={cn('inline-flex flex-col gap-0.5', className)}>
      <div className="inline-flex items-baseline gap-2 flex-wrap">
        {/* Current price — dominant */}
        <span className={cn('text-ragab-ink-800 font-arabic tracking-tight', fontSizes[size])}>
          {price.toFixed(2)}{' '}
          <span className="text-caption font-semibold text-ragab-ink-500">{t.common.egp}</span>
        </span>

        {/* Old price — struck through, muted */}
        {hasDiscount && (
          <span className={cn('text-ragab-ink-500 line-through font-medium', oldFontSizes[size])}>
            {oldPrice!.toFixed(2)}
          </span>
        )}

        {/* Savings chip */}
        {showSavings && hasDiscount && (
          <span className="text-caption font-bold text-ragab-success bg-ragab-success-soft px-1.5 py-0.5 rounded-md border border-emerald-200">
            {t.common.save} {savingsAmount} {t.common.egp}
          </span>
        )}
      </div>

      {/* Per-unit price */}
      {perUnit && (
        <span className="text-caption text-ragab-ink-500 font-arabic">{perUnit}</span>
      )}
    </div>
  );
};
