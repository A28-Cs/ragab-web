'use client';

import React from 'react';
import { cn } from '@ragab/utils';

export type StatusTone = 'success' | 'warning' | 'info' | 'danger' | 'neutral';

interface StatusPillProps {
  tone: StatusTone;
  children: React.ReactNode;
  /** small leading dot as a non-color cue reinforcement */
  dot?: boolean;
  className?: string;
}

const tones: Record<StatusTone, { wrap: string; dot: string }> = {
  success: { wrap: 'bg-ragab-success-soft text-ragab-success border-emerald-200', dot: 'bg-ragab-success' },
  warning: { wrap: 'bg-ragab-warning-soft text-ragab-warning border-amber-200', dot: 'bg-ragab-warning' },
  info: { wrap: 'bg-ragab-info-soft text-ragab-info border-blue-200', dot: 'bg-ragab-info' },
  danger: { wrap: 'bg-ragab-danger-soft text-ragab-danger border-red-200', dot: 'bg-ragab-danger' },
  neutral: { wrap: 'bg-ragab-ink-100 text-ragab-ink-700 border-ragab-ink-200', dot: 'bg-ragab-ink-500' },
};

export const StatusPill: React.FC<StatusPillProps> = ({ tone, children, dot = true, className = '' }) => {
  const t = tones[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-caption font-semibold font-arabic whitespace-nowrap',
        t.wrap,
        className
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', t.dot)} />}
      {children}
    </span>
  );
};
