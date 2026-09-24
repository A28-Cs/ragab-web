'use client';

import React from 'react';
import { cn } from '@ragab/utils';

interface FormFieldProps {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  htmlFor,
  hint,
  error,
  required,
  className = '',
  children,
}) => {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-label text-ragab-ink-700 font-arabic">
          {label}
          {required && <span className="text-ragab-danger ms-1">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-caption text-ragab-danger font-arabic" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-caption text-ragab-ink-500 font-arabic">{hint}</p>
      ) : null}
    </div>
  );
};
