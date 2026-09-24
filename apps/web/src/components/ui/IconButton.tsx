'use client';

import React from 'react';
import { cn } from '@ragab/utils';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  ariaLabel: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  badgeCount?: number;
}

const variants = {
  primary: 'bg-ragab-brand-500 text-ragab-ink-800 hover:bg-ragab-brand-600 shadow-subtle',
  secondary:
    'bg-ragab-cream text-ragab-ink-800 hover:bg-ragab-brand-100 border border-ragab-brand-200',
  outline: 'bg-white text-ragab-ink-800 border border-ragab-ink-200 hover:bg-ragab-ink-50',
  ghost: 'bg-transparent text-ragab-ink-800 hover:bg-ragab-ink-100',
};

const sizes = {
  sm: 'w-9 h-9 text-sm',
  md: 'w-11 h-11 text-base',
  lg: 'w-12 h-12 text-lg',
};

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  ariaLabel,
  variant = 'ghost',
  size = 'md',
  badgeCount,
  className = '',
  ...props
}) => {
  return (
    <button
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(
        'relative inline-flex items-center justify-center rounded-lg transition-all duration-200 focus-ring disabled:opacity-50 disabled:cursor-not-allowed active:scale-95',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {icon}
      {badgeCount !== undefined && badgeCount > 0 && (
        <span
          aria-live="polite"
          className="absolute -top-1 -end-1 bg-ragab-danger text-white text-caption font-bold min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center border-2 border-white shadow-subtle animate-in zoom-in-75"
        >
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </button>
  );
};
