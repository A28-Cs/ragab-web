'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@ragab/utils';
import { useLanguage } from '../../context/LanguageContext';
import { Button } from './Button';

interface CursorPagerProps {
  /** 1-based page currently shown. */
  page: number;
  /** Pages implied by the server's `total` (≥ 1). */
  pageCount: number;
  /** Whether the server reported another page after this one. */
  hasMore: boolean;
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Pager for keyset (cursor) listings: pages are reached in order, so the control is
 * previous / next with "page N of M" — never a numeric jump the API cannot serve.
 */
export const CursorPager: React.FC<CursorPagerProps> = ({ page, pageCount, hasMore, onPrev, onNext, disabled, className }) => {
  const { t, isRTL } = useLanguage();
  const PrevIcon = isRTL ? ChevronRight : ChevronLeft;
  const NextIcon = isRTL ? ChevronLeft : ChevronRight;
  const label = t.admin.pagerPage.replace('{n}', String(page)).replace('{m}', String(Math.max(pageCount, page)));

  return (
    <nav className={cn('flex items-center justify-between gap-3', className)} aria-label={label} data-testid="cursor-pager">
      <Button variant="outline" size="sm" onClick={onPrev} disabled={disabled || page <= 1} leftIcon={<PrevIcon className="w-4 h-4" />}>
        {t.admin.pagerPrev}
      </Button>
      <span className="text-body-sm text-ragab-ink-500" aria-live="polite">
        {label}
      </span>
      <Button variant="outline" size="sm" onClick={onNext} disabled={disabled || !hasMore} leftIcon={<NextIcon className="w-4 h-4" />}>
        {t.admin.pagerNext}
      </Button>
    </nav>
  );
};
