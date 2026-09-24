import React from 'react';
import { cn, formatCurrency } from '@ragab/utils';

export interface PriceProps {
  amount: number;
  oldAmount?: number;
  currency?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const Price: React.FC<PriceProps> = ({
  amount,
  oldAmount,
  currency = 'ج.م',
  size = 'md',
  className,
}) => {
  const sizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-2xl',
  };

  const oldSizes = {
    sm: 'text-xs',
    md: 'text-xs',
    lg: 'text-sm',
    xl: 'text-base',
  };

  return (
    <div className={cn('inline-flex items-baseline gap-1.5 flex-wrap', className)}>
      <span className={cn('font-bold text-ragab-charcoal font-arabic', sizes[size])}>
        {formatCurrency(amount, currency)}
      </span>
      {oldAmount && oldAmount > amount && (
        <span className={cn('line-through text-gray-400 font-arabic', oldSizes[size])}>
          {formatCurrency(oldAmount, currency)}
        </span>
      )}
    </div>
  );
};
