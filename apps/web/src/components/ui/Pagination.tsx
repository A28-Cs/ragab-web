'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@ragab/utils';
import { useLanguage } from '../../context/LanguageContext';

interface PaginationProps {
  page: number; // 1-based
  pageCount: number;
  onChange: (page: number) => void;
  className?: string;
}

function pagesToShow(page: number, pageCount: number): (number | '…')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const set = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  const sorted = [...set].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

export const Pagination: React.FC<PaginationProps> = ({ page, pageCount, onChange, className = '' }) => {
  const { isRTL } = useLanguage();
  if (pageCount <= 1) return null;
  const Prev = isRTL ? ChevronRight : ChevronLeft;
  const Next = isRTL ? ChevronLeft : ChevronRight;

  const btn = 'inline-flex items-center justify-center min-w-[40px] h-10 px-2 rounded-lg text-body-sm font-semibold transition-colors focus-ring';

  return (
    <nav className={cn('flex items-center justify-center gap-1.5 font-arabic', className)} aria-label="pagination">
      <button
        className={cn(btn, 'text-ragab-ink-600 hover:bg-ragab-ink-100 disabled:opacity-40 disabled:pointer-events-none')}
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="previous"
      >
        <Prev className="w-4 h-4" />
      </button>
      {pagesToShow(page, pageCount).map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} className="px-1 text-ragab-ink-400">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            aria-current={p === page}
            className={cn(
              btn,
              p === page
                ? 'bg-ragab-brand-500 text-ragab-ink-800'
                : 'text-ragab-ink-600 hover:bg-ragab-ink-100'
            )}
          >
            {p}
          </button>
        )
      )}
      <button
        className={cn(btn, 'text-ragab-ink-600 hover:bg-ragab-ink-100 disabled:opacity-40 disabled:pointer-events-none')}
        onClick={() => onChange(page + 1)}
        disabled={page >= pageCount}
        aria-label="next"
      >
        <Next className="w-4 h-4" />
      </button>
    </nav>
  );
};
