'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@ragab/utils';

interface StepperProps {
  steps: string[];
  /** zero-based index of the current step */
  current: number;
  className?: string;
}

export const Stepper: React.FC<StepperProps> = ({ steps, current, className = '' }) => {
  return (
    <ol className={cn('flex items-center w-full font-arabic', className)}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const last = i === steps.length - 1;
        return (
          <li key={i} className={cn('flex items-center', !last && 'flex-1')}>
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <span
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full text-body-sm font-bold border-2 transition-colors',
                  done && 'bg-ragab-success border-ragab-success text-white',
                  active && 'bg-ragab-brand-500 border-ragab-brand-500 text-ragab-ink-800',
                  !done && !active && 'bg-white border-ragab-ink-300 text-ragab-ink-400'
                )}
              >
                {done ? <Check className="w-4 h-4" strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={cn(
                  'text-caption whitespace-nowrap text-center',
                  active ? 'text-ragab-ink-800 font-semibold' : 'text-ragab-ink-500'
                )}
              >
                {label}
              </span>
            </div>
            {!last && (
              <span
                className={cn(
                  'flex-1 h-0.5 mx-2 rounded-full -mt-5',
                  i < current ? 'bg-ragab-success' : 'bg-ragab-ink-200'
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
};
