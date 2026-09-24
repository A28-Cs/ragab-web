'use client';

import React from 'react';
import Link from 'next/link';
import { cn } from '@ragab/utils';
import { Category } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { categoryEmoji } from '../../lib/categoryPresentation';

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
  const emoji = categoryEmoji(category);
  const countLabel = `${category.itemCount} ${isRTL ? 'منتج' : 'items'}`;

  if (variant === 'pill') {
    return (
      <Link
        href={`/category/${category.slug}`}
        className={cn(
          'group inline-flex items-center gap-2 h-11 ps-2 pe-4 rounded-full bg-white border border-ragab-ink-200 hover:border-ragab-brand-400 hover:bg-ragab-cream-soft transition-all duration-200 shadow-subtle flex-shrink-0 focus-ring',
          className
        )}
      >
        <span className="w-8 h-8 rounded-full bg-ragab-cream flex items-center justify-center text-base leading-none">
          <span aria-hidden="true">{emoji}</span>
        </span>
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
        <span className="w-10 h-10 rounded-xl bg-ragab-ink-50 border border-ragab-ink-100 flex items-center justify-center text-xl leading-none shrink-0 group-hover:bg-ragab-cream transition-colors">
          <span aria-hidden="true">{emoji}</span>
        </span>
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
        'group bg-white rounded-2xl border border-ragab-ink-200 px-3 py-5 flex flex-col items-center text-center hover:border-ragab-brand-400 hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 focus-ring',
        className
      )}
    >
      <span
        aria-hidden="true"
        className="text-[2rem] leading-none mb-3 group-hover:scale-110 transition-transform duration-200"
      >
        {emoji}
      </span>
      <h3 className="text-body-sm font-bold text-ragab-ink-800 font-arabic leading-snug line-clamp-2">
        {name}
      </h3>
      <span className="text-caption text-ragab-ink-500 font-arabic mt-1">{countLabel}</span>
    </Link>
  );
};
