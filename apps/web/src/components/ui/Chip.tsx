'use client';

import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@ragab/utils';

interface ChipProps {
  children: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  /** Renders a small ✕ and calls this on click (active-filter chips) */
  onRemove?: () => void;
  className?: string;
}

/** Selectable pill — category rails, filter chips, quick suggestions. */
export const Chip: React.FC<ChipProps> = ({
  children,
  selected = false,
  onClick,
  onRemove,
  className = '',
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={onClick ? selected : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-body-sm font-semibold font-arabic whitespace-nowrap transition-colors select-none focus-ring',
        selected
          ? 'bg-ragab-ink-800 text-white border-ragab-ink-800'
          : 'bg-white text-ragab-ink-700 border-ragab-ink-200 hover:border-ragab-ink-400 hover:bg-ragab-ink-50',
        className
      )}
    >
      {children}
      {onRemove && (
        <span
          role="button"
          aria-label="إزالة"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-white/20"
        >
          <X className="w-3 h-3" />
        </span>
      )}
    </button>
  );
};
