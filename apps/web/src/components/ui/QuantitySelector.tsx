'use client';

import React from 'react';
import { Plus, Minus, Trash2 } from 'lucide-react';
import { cn } from '@ragab/utils';

interface QuantitySelectorProps {
  quantity: number;
  onIncrease: () => void;
  onDecrease: () => void;
  min?: number;
  /** Pass the product's stockQuantity to clamp against real stock. */
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  allowDelete?: boolean;
  className?: string;
}

const sizes = {
  sm: 'h-9 px-1 text-body-sm gap-1',
  md: 'h-11 px-1.5 text-body-sm gap-1.5',
  lg: 'h-12 px-2 text-body gap-2',
};

const btnSizes = {
  sm: 'w-7 h-7',
  md: 'w-9 h-9',
  lg: 'w-10 h-10',
};

export const QuantitySelector: React.FC<QuantitySelectorProps> = ({
  quantity,
  onIncrease,
  onDecrease,
  min = 1,
  max = 99,
  size = 'md',
  allowDelete = false,
  className = '',
}) => {
  const isAtMin = quantity <= min;
  const isAtMax = quantity >= max;

  return (
    <div
      className={cn(
        'inline-flex items-center justify-between bg-ragab-cream/60 border border-ragab-brand-300 rounded-lg font-bold text-ragab-ink-800',
        sizes[size],
        className
      )}
    >
      <button
        type="button"
        onClick={onDecrease}
        disabled={isAtMin && !allowDelete}
        aria-label="تقليل الكمية"
        className={cn(
          btnSizes[size],
          'rounded-md flex items-center justify-center bg-white hover:bg-ragab-brand-500 text-ragab-ink-800 transition-colors disabled:opacity-40 disabled:hover:bg-white shadow-subtle focus-ring'
        )}
      >
        {isAtMin && allowDelete ? (
          <Trash2 className="w-4 h-4 text-ragab-danger" />
        ) : (
          <Minus className="w-4 h-4" />
        )}
      </button>

      <span aria-live="polite" className="w-8 text-center font-bold font-arabic px-1">
        {quantity}
      </span>

      <button
        type="button"
        onClick={onIncrease}
        disabled={isAtMax}
        aria-label="زيادة الكمية"
        className={cn(
          btnSizes[size],
          'rounded-md flex items-center justify-center bg-ragab-brand-500 hover:bg-ragab-brand-600 text-ragab-ink-800 transition-colors disabled:opacity-40 shadow-subtle focus-ring'
        )}
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};
