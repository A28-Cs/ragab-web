import React from 'react';
import { cn } from '@ragab/utils';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'yellow' | 'red' | 'green' | 'gray' | 'cream';
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'yellow',
  size = 'md',
  className,
}) => {
  const variants = {
    yellow: 'bg-ragab-yellow text-ragab-charcoal font-bold',
    red: 'bg-red-500 text-white font-bold',
    green: 'bg-emerald-100 text-emerald-800 font-semibold',
    gray: 'bg-gray-100 text-gray-700 font-medium',
    cream: 'bg-ragab-cream text-ragab-charcoal font-semibold border border-ragab-yellow/30',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-[10px] rounded',
    md: 'px-2.5 py-1 text-xs rounded-md',
  };

  return (
    <span className={cn('inline-flex items-center tracking-tight', variants[variant], sizes[size], className)}>
      {children}
    </span>
  );
};
