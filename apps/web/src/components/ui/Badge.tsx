'use client';

import React from 'react';
import { cn } from '@ragab/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?:
    | 'discount'
    | 'promo'
    | 'success'
    | 'neutral'
    | 'warning'
    | 'dark'
    // legacy aliases kept for compatibility
    | 'yellow'
    | 'green'
    | 'red'
    | 'gray'
    | 'cream';
  size?: 'sm' | 'md';
  className?: string;
}

const variants: Record<NonNullable<BadgeProps['variant']>, string> = {
  // Semantic set
  discount: 'bg-ragab-danger text-white font-bold',
  promo: 'bg-ragab-brand-500 text-ragab-ink-800 font-bold',
  success: 'bg-ragab-success-soft text-ragab-success font-bold border border-emerald-200',
  neutral: 'bg-ragab-ink-100 text-ragab-ink-700 font-semibold border border-ragab-ink-200',
  warning: 'bg-ragab-brand-500 text-ragab-ink-800 font-bold',
  dark: 'bg-ragab-ink-800 text-white font-bold',
  // Legacy aliases → mapped onto the semantic set
  yellow: 'bg-ragab-brand-500 text-ragab-ink-800 font-bold',
  green: 'bg-ragab-success-soft text-ragab-success font-bold border border-emerald-200',
  red: 'bg-ragab-danger text-white font-bold',
  gray: 'bg-ragab-ink-100 text-ragab-ink-700 font-semibold border border-ragab-ink-200',
  cream: 'bg-ragab-cream text-ragab-ink-800 font-bold border border-ragab-brand-200',
};

const sizes = {
  sm: 'text-caption px-2.5 py-1 rounded-full leading-none',
  md: 'text-body-sm px-3 py-1.5 rounded-full leading-none',
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'yellow',
  size = 'sm',
  className = '',
}) => {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center select-none whitespace-nowrap',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </span>
  );
};
