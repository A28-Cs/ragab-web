'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@ragab/utils';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** visual size of the box */
  size?: 'sm' | 'md';
}

export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onChange,
  label,
  disabled,
  id,
  className = '',
  size = 'md',
}) => {
  const box = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  return (
    <label
      htmlFor={id}
      className={cn(
        'inline-flex items-center gap-2.5 cursor-pointer select-none font-arabic',
        disabled && 'opacity-60 cursor-not-allowed',
        className
      )}
    >
      <span className="relative inline-flex">
        <input
          id={id}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          className={cn(
            box,
            'rounded-md border-2 flex items-center justify-center transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ragab-brand-500 peer-focus-visible:ring-offset-2',
            checked
              ? 'bg-ragab-brand-500 border-ragab-brand-500'
              : 'bg-white border-ragab-ink-300'
          )}
        >
          {checked && <Check className="w-3.5 h-3.5 text-ragab-ink-800" strokeWidth={3} />}
        </span>
      </span>
      {label && <span className="text-body-sm text-ragab-ink-700">{label}</span>}
    </label>
  );
};
