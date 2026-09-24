'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@ragab/utils';
import { useLanguage } from '../../context/LanguageContext';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionHref?: string;
  actionLabel?: string;
  /** Heading id for aria-labelledby on the parent section */
  id?: string;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  actionHref,
  actionLabel,
  id,
  className = '',
}) => {
  const { t } = useLanguage();

  return (
    <div
      className={cn(
        'flex items-end justify-between gap-4 mb-5 md:mb-6 pb-4 border-b border-ragab-ink-200/80',
        className
      )}
    >
      <div className="min-w-0">
        <h2 id={id} className="text-h2 text-ragab-ink-800 tracking-tight font-arabic">
          {title}
        </h2>
        {subtitle && (
          <p className="text-body-sm text-ragab-ink-500 font-arabic mt-1">{subtitle}</p>
        )}
      </div>

      {actionHref && (
        <Link
          href={actionHref}
          className="inline-flex items-center gap-1.5 text-body-sm font-bold text-ragab-ink-700 hover:text-ragab-ink-900 transition-colors shrink-0 group py-1 focus-ring rounded-md"
        >
          <span>{actionLabel || t.common.viewAll}</span>
          <ArrowLeft className="w-4 h-4 ltr:rotate-180 group-hover:-translate-x-1 ltr:group-hover:translate-x-1 transition-transform" />
        </Link>
      )}
    </div>
  );
};
