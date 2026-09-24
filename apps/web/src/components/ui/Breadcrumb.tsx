'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@ragab/utils';

export interface Crumb {
  label: string;
  href?: string;
}

export const Breadcrumb: React.FC<{ items: Crumb[]; className?: string }> = ({ items, className = '' }) => {
  return (
    <nav aria-label="breadcrumb" className={cn('flex items-center flex-wrap gap-1 font-arabic', className)}>
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {item.href && !last ? (
              <Link
                href={item.href}
                className="text-caption text-ragab-ink-500 hover:text-ragab-ink-800 transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className={cn('text-caption', last ? 'text-ragab-ink-800 font-semibold' : 'text-ragab-ink-500')}>
                {item.label}
              </span>
            )}
            {!last && <ChevronLeft className="w-3.5 h-3.5 text-ragab-ink-300 ltr:rotate-180" />}
          </span>
        );
      })}
    </nav>
  );
};
