'use client';

import React, { forwardRef, useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Input, InputProps } from './Input';

interface PasswordInputProps extends Omit<InputProps, 'type' | 'endSlot' | 'startIcon'> {
  showIcon?: boolean;
  showLabel?: string;
  hideLabel?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ showIcon = true, showLabel = 'إظهار كلمة المرور', hideLabel = 'إخفاء كلمة المرور', ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    return (
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        startIcon={showIcon ? <Lock className="w-4 h-4" /> : undefined}
        endSlot={
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? hideLabel : showLabel}
            aria-pressed={visible}
            className="touch-target flex items-center justify-center text-ragab-ink-400 hover:text-ragab-ink-700 rounded-lg focus-ring"
          >
            {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        }
        {...props}
      />
    );
  }
);

PasswordInput.displayName = 'PasswordInput';
