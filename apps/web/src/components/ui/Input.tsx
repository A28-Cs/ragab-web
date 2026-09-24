'use client';

import React, { forwardRef } from 'react';
import { cn } from '@ragab/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** Icon rendered at the start (RTL-aware) of the field */
  startIcon?: React.ReactNode;
  /** Icon or control rendered at the end (RTL-aware) of the field */
  endSlot?: React.ReactNode;
  fieldSize?: 'md' | 'lg';
}

const sizes = {
  md: 'h-11 text-body-sm',
  lg: 'h-12 text-body',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', invalid, startIcon, endSlot, fieldSize = 'md', ...props }, ref) => {
    return (
      <div className="relative">
        {startIcon && (
          <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-ragab-ink-400">
            {startIcon}
          </span>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full rounded-lg border bg-white text-ragab-ink-800 font-arabic placeholder:text-ragab-ink-400 transition-colors focus-ring',
            'px-3.5',
            sizes[fieldSize],
            startIcon && 'ps-10',
            endSlot && 'pe-11',
            invalid
              ? 'border-ragab-danger focus-visible:ring-ragab-danger'
              : 'border-ragab-ink-300 hover:border-ragab-ink-400 focus:border-ragab-brand-500',
            'disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-ragab-ink-50',
            className
          )}
          aria-invalid={invalid || undefined}
          {...props}
        />
        {endSlot && (
          <span className="absolute inset-y-0 end-0 flex items-center pe-2">{endSlot}</span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
