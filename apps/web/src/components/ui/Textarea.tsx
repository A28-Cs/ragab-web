'use client';

import React, { forwardRef } from 'react';
import { cn } from '@ragab/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', invalid, rows = 3, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(
          'w-full rounded-lg border bg-white text-body-sm text-ragab-ink-800 font-arabic placeholder:text-ragab-ink-400 transition-colors focus-ring px-3.5 py-2.5 resize-y',
          invalid
            ? 'border-ragab-danger focus-visible:ring-ragab-danger'
            : 'border-ragab-ink-300 hover:border-ragab-ink-400 focus:border-ragab-brand-500',
          'disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-ragab-ink-50',
          className
        )}
        aria-invalid={invalid || undefined}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';
