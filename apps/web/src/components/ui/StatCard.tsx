'use client';

import React from 'react';
import { cn } from '@ragab/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  hint?: string;
  tone?: 'brand' | 'success' | 'info' | 'warning' | 'danger';
  className?: string;
}

const tones = {
  brand: 'bg-ragab-brand-100 text-ragab-brand-700',
  success: 'bg-ragab-success-soft text-ragab-success',
  info: 'bg-ragab-info-soft text-ragab-info',
  warning: 'bg-ragab-warning-soft text-ragab-warning',
  danger: 'bg-ragab-danger-soft text-ragab-danger',
};

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  hint,
  tone = 'brand',
  className = '',
}) => {
  return (
    <div
      className={cn(
        'bg-ragab-surface rounded-xl border border-ragab-ink-200 shadow-subtle p-4 flex items-center gap-3.5',
        className
      )}
    >
      {icon && (
        <span className={cn('flex items-center justify-center w-11 h-11 rounded-xl shrink-0', tones[tone])}>
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-caption text-ragab-ink-500 font-arabic truncate">{label}</p>
        <p className="text-h2 text-ragab-ink-800 font-bold leading-tight">{value}</p>
        {hint && <p className="text-caption text-ragab-ink-400 font-arabic">{hint}</p>}
      </div>
    </div>
  );
};
