'use client';

import React from 'react';
import { cn } from '@ragab/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: 'div' | 'section' | 'article';
  padded?: boolean;
  interactive?: boolean;
}

export const Card: React.FC<CardProps> = ({
  as: Tag = 'div',
  padded = true,
  interactive = false,
  className = '',
  children,
  ...props
}) => {
  return (
    <Tag
      className={cn(
        'bg-ragab-surface rounded-xl border border-ragab-ink-200 shadow-subtle',
        padded && 'p-4 sm:p-5',
        interactive && 'transition-shadow hover:shadow-card-hover',
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
};

export const CardHeader: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, action, className = '' }) => (
  <div className={cn('flex items-start justify-between gap-3 mb-4', className)}>
    <div className="min-w-0">
      <h3 className="text-h3 text-ragab-ink-800 font-arabic">{title}</h3>
      {subtitle && <p className="text-body-sm text-ragab-ink-500 font-arabic mt-0.5">{subtitle}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);
