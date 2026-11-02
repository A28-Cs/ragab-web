'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@ragab/utils';

export interface TimelineStep {
  label: string;
  description?: string;
  timestamp?: string;
  state: 'done' | 'current' | 'upcoming' | 'cancelled';
}

export const Timeline: React.FC<{ steps: TimelineStep[]; compact?: boolean; className?: string }> = ({
  steps,
  compact = false,
  className = '',
}) => {
  return (
    <ol className={cn('relative font-arabic', className)}>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const done = step.state === 'done';
        const current = step.state === 'current';
        const cancelled = step.state === 'cancelled';
        return (
          <li key={i} className={cn('relative flex', compact ? 'gap-2.5 pb-3.5 last:pb-0' : 'gap-3.5 pb-6 last:pb-0')}>
            {/* connector line */}
            {!last && (
              <span
                className={cn(
                  'absolute bottom-0 w-0.5',
                  compact ? 'top-5 start-[9px]' : 'top-7 start-[13px]',
                  done ? 'bg-ragab-success' : 'bg-ragab-ink-200'
                )}
              />
            )}
            {/* node */}
            <span
              className={cn(
                'relative z-10 flex items-center justify-center rounded-full border-2 shrink-0',
                compact ? 'w-5 h-5' : 'w-7 h-7',
                done && 'bg-ragab-success border-ragab-success text-white',
                current && 'bg-ragab-brand-500 border-ragab-brand-500 text-ragab-ink-800 ring-4 ring-ragab-brand-100',
                cancelled && 'bg-ragab-danger-soft border-ragab-danger text-ragab-danger',
                step.state === 'upcoming' && 'bg-white border-ragab-ink-300 text-ragab-ink-300'
              )}
            >
              {done ? (
                <Check className={compact ? 'w-3 h-3' : 'w-4 h-4'} strokeWidth={3} />
              ) : (
                <span className={cn('rounded-full bg-current', compact ? 'w-1.5 h-1.5' : 'w-2 h-2')} />
              )}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p
                className={cn(
                  compact ? 'text-caption font-bold' : 'text-body-sm font-bold',
                  current ? 'text-ragab-ink-800' : cancelled ? 'text-ragab-danger' : done ? 'text-ragab-ink-800' : 'text-ragab-ink-400'
                )}
              >
                {step.label}
              </p>
              {step.description && <p className={cn(compact ? 'text-[11px]' : 'text-caption', 'text-ragab-ink-500 break-words')}>{step.description}</p>}
              {step.timestamp && <p className={cn(compact ? 'text-[10px]' : 'text-caption', 'text-ragab-ink-400 mt-0.5')}>{step.timestamp}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
};
