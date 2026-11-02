'use client';

import React from 'react';
import Link from 'next/link';
import { cn } from '@ragab/utils';
import { Category } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { CategoryIcon } from '../ui/CategoryIcon';

interface CategoryCardProps {
  category: Category;
  variant?: 'card' | 'pill' | 'compact';
  className?: string;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({
  category,
  variant = 'card',
  className = '',
}) => {
  const { isRTL } = useLanguage();
  const name = isRTL ? category.nameAr : category.nameEn;
  const countLabel = `${category.itemCount} ${isRTL ? 'منتج' : 'items'}`;

  if (variant === 'pill') {
    return (
      <Link
        href={`/category/${category.slug}`}
        className={cn(
          'group inline-flex items-center gap-2.5 h-11 ps-1.5 pe-4 rounded-full bg-white border border-ragab-ink-200 hover:border-ragab-brand-400 hover:bg-ragab-cream-soft transition-all duration-200 shadow-subtle flex-shrink-0 focus-ring',
          className
        )}
      >
        <CategoryIcon category={category} withBadge size="sm" />
        <span className="text-body-sm font-bold text-ragab-ink-800 font-arabic whitespace-nowrap">
          {name}
        </span>
      </Link>
    );
  }

  if (variant === 'compact') {
    return (
      <Link
        href={`/category/${category.slug}`}
        className={cn(
          'group flex items-center gap-3 p-2.5 rounded-xl hover:bg-ragab-cream-soft transition-colors focus-ring',
          className
        )}
      >
        <CategoryIcon category={category} withBadge size="md" className="shrink-0" />
        <span className="min-w-0">
          <span className="block text-body-sm font-bold text-ragab-ink-800 font-arabic truncate">
            {name}
          </span>
          <span className="block text-caption text-ragab-ink-500 font-arabic">{countLabel}</span>
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={`/category/${category.slug}`}
      className={cn(
        'group bg-white rounded-2xl border border-ragab-ink-200 p-2.5 xs:p-3 sm:p-5 flex flex-col items-center text-center hover:border-ragab-brand-400 hover:shadow-card-hover hover:-translate-y-1 transition-all duration-200 focus-ring min-w-0',
        className
      )}
    >
      <CategoryIcon category={category} withBadge size="md" className="mb-2 xs:mb-3.5 sm:scale-110 group-hover:scale-110 transition-transform" />
      <h3 className="text-caption xs:text-body-sm font-bold text-ragab-ink-900 font-arabic leading-snug line-clamp-2">
        {name}
      </h3>
      <span className="text-[11px] xs:text-caption text-ragab-ink-500 font-arabic mt-0.5 xs:mt-1">{countLabel}</span>
    </Link>
  );
};
