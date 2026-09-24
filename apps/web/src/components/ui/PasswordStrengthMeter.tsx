'use client';

import React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@ragab/utils';

export interface PasswordRule {
  label: string;
  test: (pw: string) => boolean;
}

export function scorePassword(pw: string, rules: PasswordRule[]): number {
  return rules.reduce((n, r) => (r.test(pw) ? n + 1 : n), 0);
}

interface PasswordStrengthMeterProps {
  value: string;
  rules: PasswordRule[];
  strengthLabels: [string, string, string, string]; // weak, fair, good, strong
  title?: string;
  showRules?: boolean;
}

export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({
  value,
  rules,
  strengthLabels,
  title,
  showRules = true,
}) => {
  const passed = scorePassword(value, rules);
  const ratio = rules.length ? passed / rules.length : 0;
  // 4 buckets: weak / fair / good / strong
  const level = value.length === 0 ? -1 : Math.min(3, Math.floor(ratio * 4));

  const barColors = [
    'bg-ragab-danger',
    'bg-ragab-warning',
    'bg-ragab-info',
    'bg-ragab-success',
  ];
  const labelColors = [
    'text-ragab-danger',
    'text-ragab-warning',
    'text-ragab-info',
    'text-ragab-success',
  ];

  return (
    <div className="flex flex-col gap-2 font-arabic">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                level >= i ? barColors[level] : 'bg-ragab-ink-200'
              )}
            />
          ))}
        </div>
        {level >= 0 && (
          <span className={cn('text-caption font-semibold min-w-[3.5rem] text-end', labelColors[level])}>
            {title ? `${title}: ` : ''}
            {strengthLabels[level]}
          </span>
        )}
      </div>
      {showRules && value.length > 0 && (
        <ul className="grid grid-cols-1 xs:grid-cols-2 gap-1">
          {rules.map((r) => {
            const ok = r.test(value);
            return (
              <li
                key={r.label}
                className={cn(
                  'flex items-center gap-1.5 text-caption',
                  ok ? 'text-ragab-success' : 'text-ragab-ink-500'
                )}
              >
                {ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                <span>{r.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
