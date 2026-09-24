'use client';

import React, { useRef } from 'react';
import { cn } from '@ragab/utils';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  invalid?: boolean;
  autoFocus?: boolean;
}

/**
 * Accessible 6-box OTP field. Keeps a single string value; each box shows one
 * character. Handles paste, backspace navigation and auto-advance. LTR digits
 * even in an RTL page (numbers read left-to-right).
 */
export const OtpInput: React.FC<OtpInputProps> = ({
  value,
  onChange,
  length = 6,
  invalid,
  autoFocus,
}) => {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const setChar = (index: number, char: string) => {
    const chars = value.split('');
    chars[index] = char;
    // pad
    const next = Array.from({ length }, (_, i) => chars[i] ?? '').join('').slice(0, length);
    onChange(next);
  };

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    if (!digit) {
      setChar(index, '');
      return;
    }
    setChar(index, digit);
    if (index < length - 1) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < length - 1) refs.current[index + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (digits) {
      onChange(digits);
      refs.current[Math.min(digits.length, length - 1)]?.focus();
    }
  };

  return (
    <div dir="ltr" className="flex items-center justify-center gap-2 sm:gap-3">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          value={value[i] ?? ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          aria-label={`رقم ${i + 1}`}
          className={cn(
            'w-11 h-12 sm:w-12 sm:h-14 text-center text-h3 font-bold rounded-xl border-2 bg-white text-ragab-ink-800 transition-colors focus-ring',
            invalid
              ? 'border-ragab-danger'
              : value[i]
                ? 'border-ragab-brand-500'
                : 'border-ragab-ink-300'
          )}
        />
      ))}
    </div>
  );
};
