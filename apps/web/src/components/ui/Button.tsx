'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@ragab/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variants = {
  primary:
    'bg-ragab-brand-500 text-white hover:bg-ragab-brand-600 shadow-[0_6px_18px_-6px_rgba(20,184,166,0.6)] font-bold border border-transparent',
  secondary:
    'bg-ragab-cream text-ragab-ink-800 hover:bg-ragab-brand-100 border border-ragab-brand-200 font-bold',
  outline:
    'bg-white text-ragab-ink-800 border border-ragab-ink-200 hover:border-ragab-ink-300 hover:bg-ragab-ink-50 font-bold shadow-subtle',
  ghost: 'bg-transparent text-ragab-ink-800 hover:bg-ragab-ink-100/80 font-bold',
  danger: 'bg-ragab-danger text-white hover:bg-red-700 shadow-subtle font-bold',
  dark: 'bg-ragab-ink-800 text-white hover:bg-ragab-ink-900 shadow-subtle font-bold',
};

const sizes = {
  sm: 'text-body-sm px-3.5 gap-1.5 h-9',
  md: 'text-body-sm px-4 gap-2 h-11',
  lg: 'text-body px-6 gap-2.5 h-12',
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  className = '',
  disabled,
  ...props
}) => {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 focus-ring disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] select-none whitespace-nowrap',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin text-current" />
          <span className="opacity-70">{children}</span>
        </>
      ) : (
        <>
          {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
          <span>{children}</span>
          {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
        </>
      )}
    </button>
  );
};
