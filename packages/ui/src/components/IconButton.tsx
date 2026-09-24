import React from 'react';
import { cn } from '@ragab/utils';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  ariaLabel: string;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  variant = 'ghost',
  size = 'md',
  ariaLabel,
  className,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ragab-yellow active:scale-95 disabled:opacity-50';

  const variants = {
    primary: 'bg-ragab-yellow text-ragab-charcoal hover:bg-ragab-yellow-hover shadow-subtle',
    secondary: 'bg-ragab-cream text-ragab-charcoal hover:bg-[#FFEAB0]',
    outline: 'border border-ragab-border bg-white text-ragab-charcoal hover:bg-ragab-bg',
    ghost: 'text-ragab-charcoal hover:bg-gray-100',
  };

  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  };

  return (
    <button
      aria-label={ariaLabel}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      {...props}
    >
      {icon}
    </button>
  );
};
