'use client';

import React from 'react';
import { cn } from '@ragab/utils';

export interface TabItem {
  value: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  variant?: 'underline' | 'segmented';
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  items,
  value,
  onChange,
  variant = 'underline',
  className = '',
}) => {
  if (variant === 'segmented') {
    return (
      <div
        role="tablist"
        className={cn(
          'inline-flex items-center gap-1 rounded-xl bg-ragab-ink-100 p-1 overflow-x-auto scroll-rail max-w-full',
          className
        )}
      >
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.value)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3.5 h-9 text-body-sm font-semibold font-arabic whitespace-nowrap transition-colors focus-ring',
                active
                  ? 'bg-white text-ragab-ink-800 shadow-subtle'
                  : 'text-ragab-ink-500 hover:text-ragab-ink-800'
              )}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge != null && item.badge > 0 && (
                <span className="ms-1 rounded-full bg-ragab-brand-500 text-ragab-ink-800 text-[10px] font-bold px-1.5 min-w-[18px] text-center">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      className={cn(
        'flex items-center gap-1 border-b border-ragab-ink-200 overflow-x-auto scroll-rail',
        className
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3.5 pb-2.5 pt-1 -mb-px border-b-2 text-body-sm font-semibold font-arabic whitespace-nowrap transition-colors focus-ring',
              active
                ? 'border-ragab-brand-500 text-ragab-ink-800'
                : 'border-transparent text-ragab-ink-500 hover:text-ragab-ink-800'
            )}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge != null && item.badge > 0 && (
              <span className="ms-1 rounded-full bg-ragab-danger text-white text-[10px] font-bold px-1.5 min-w-[18px] text-center">
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
