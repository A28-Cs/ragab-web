'use client';

import React, { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@ragab/utils';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', invalid, options, placeholder, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'w-full appearance-none rounded-lg border bg-white h-11 text-body-sm text-ragab-ink-800 font-arabic transition-colors focus-ring ps-3.5 pe-10',
            invalid
              ? 'border-ragab-danger focus-visible:ring-ragab-danger'
              : 'border-ragab-ink-300 hover:border-ragab-ink-400 focus:border-ragab-brand-500',
            'disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-ragab-ink-50',
            className
          )}
          aria-invalid={invalid || undefined}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute inset-y-0 end-0 my-auto me-3 w-4 h-4 text-ragab-ink-400" />
      </div>
    );
  }
);

Select.displayName = 'Select';
