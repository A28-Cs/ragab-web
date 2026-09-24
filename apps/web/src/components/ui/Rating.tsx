'use client';

import React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@ragab/utils';

interface RatingProps {
  /** 0–5 */
  value: number;
  reviewCount?: number;
  size?: 'sm' | 'md';
  /** Render the five-star row (default) or a single star + number. */
  compact?: boolean;
  className?: string;
}

/**
 * Five-star rating (partial fill supported) + numeric value (+ optional count).
 * `compact` collapses it to one star for very dense layouts.
 */
export const Rating: React.FC<RatingProps> = ({
  value,
  reviewCount,
  size = 'sm',
  compact = false,
  className = '',
}) => {
  const clamped = Math.max(0, Math.min(5, value));
  const starCls = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-ragab-ink-600 font-arabic',
        size === 'sm' ? 'text-caption' : 'text-body-sm',
        className
      )}
      aria-label={`التقييم ${clamped.toFixed(1)} من 5${reviewCount ? ` (${reviewCount} تقييم)` : ''}`}
    >
      {compact ? (
        <Star className={cn('fill-ragab-brand-500 text-ragab-brand-500', starCls)} />
      ) : (
        <span className="inline-flex items-center gap-0.5" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => {
            const fill = Math.max(0, Math.min(1, clamped - i));
            return (
              <span key={i} className={cn('relative inline-block', starCls)}>
                <Star className={cn('absolute inset-0 text-ragab-ink-300', starCls)} />
                {fill > 0 && (
                  <span
                    className="absolute inset-y-0 start-0 overflow-hidden"
                    style={{ width: `${fill * 100}%` }}
                  >
                    <Star className={cn('fill-ragab-brand-500 text-ragab-brand-500', starCls)} />
                  </span>
                )}
              </span>
            );
          })}
        </span>
      )}
      <span className="font-bold text-ragab-ink-800 tabular-nums">{clamped.toFixed(1)}</span>
      {reviewCount !== undefined && (
        <span className="text-ragab-ink-500 tabular-nums">({reviewCount})</span>
      )}
    </span>
  );
};
