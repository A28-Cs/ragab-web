import React from 'react';
import { Plus, Minus, Trash2 } from 'lucide-react';
import { cn } from '@ragab/utils';

export interface QuantitySelectorProps {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md';
  showDeleteAtMin?: boolean;
}

export const QuantitySelector: React.FC<QuantitySelectorProps> = ({
  quantity,
  onIncrement,
  onDecrement,
  min = 1,
  max = 99,
  size = 'md',
  showDeleteAtMin = false,
}) => {
  const isAtMin = quantity <= min;
  const isAtMax = quantity >= max;

  const heights = {
    sm: 'h-8 px-1 text-xs',
    md: 'h-10 px-2 text-sm',
  };

  return (
    <div className={cn('inline-flex items-center bg-ragab-cream rounded-md border border-ragab-yellow/40', heights[size])}>
      <button
        onClick={onDecrement}
        disabled={isAtMin && !showDeleteAtMin}
        className="p-1 rounded hover:bg-ragab-yellow transition-colors text-ragab-charcoal disabled:opacity-30 disabled:hover:bg-transparent"
        aria-label="Decrease quantity"
      >
        {isAtMin && showDeleteAtMin ? <Trash2 className="w-3.5 h-3.5 text-red-600" /> : <Minus className="w-3.5 h-3.5" />}
      </button>

      <span className="w-8 text-center font-bold font-arabic text-ragab-charcoal">
        {quantity}
      </span>

      <button
        onClick={onIncrement}
        disabled={isAtMax}
        className="p-1 rounded hover:bg-ragab-yellow transition-colors text-ragab-charcoal disabled:opacity-30 disabled:hover:bg-transparent"
        aria-label="Increase quantity"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
