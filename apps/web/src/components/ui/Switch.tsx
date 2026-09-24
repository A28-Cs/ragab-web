'use client';

import React from 'react';
import { cn } from '@ragab/utils';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled,
  label,
  id,
  className = '',
}) => {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-ring',
        checked ? 'bg-ragab-success' : 'bg-ragab-ink-300',
        disabled && 'opacity-60 cursor-not-allowed',
        className
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow-subtle transition-transform',
          // RTL-aware: knob rests at the start when off, slides to the end when on
          checked ? 'ltr:translate-x-5 rtl:-translate-x-5' : 'translate-x-0.5 rtl:-translate-x-0.5'
        )}
      />
    </button>
  );
};
