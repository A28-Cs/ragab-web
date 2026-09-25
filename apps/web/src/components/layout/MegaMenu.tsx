'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LayoutGrid, ChevronDown, Tag } from 'lucide-react';
import { cn } from '@ragab/utils';
import { useLanguage } from '../../context/LanguageContext';
import { getCategories } from '../../services/categoryService';
import { Category } from '../../types';
import { CategoryCard } from '../product/CategoryCard';

/** "All departments" button + dropdown panel (desktop navigation row). */
export const MegaMenu: React.FC = () => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCategories()
      .then((cats) => setCategories(cats.filter((c) => !c.parentId)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsOpen(false);
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={cn(
          'inline-flex items-center gap-2 h-10 px-4 rounded-lg font-bold text-body-sm font-arabic transition-colors focus-ring',
          'bg-ragab-brand-50 text-ragab-brand-800 hover:bg-ragab-brand-100'
        )}
      >
        <LayoutGrid className="w-4 h-4" />
        <span>{t.common.allDepartments}</span>
        <ChevronDown className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute top-full start-0 mt-2 w-[760px] max-w-[90vw] bg-white rounded-2xl shadow-popover border border-ragab-ink-200 p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="grid grid-cols-3 gap-1 max-h-[60vh] overflow-y-auto pe-1">
            {categories.map((category) => (
              <div key={category.id} onClick={() => setIsOpen(false)}>
                <CategoryCard category={category} variant="compact" />
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-ragab-ink-100">
            <Link
              href="/offers"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 p-3 rounded-xl bg-ragab-cream-soft hover:bg-ragab-cream transition-colors font-arabic"
            >
              <span className="w-10 h-10 rounded-xl bg-ragab-brand-500 flex items-center justify-center text-ragab-ink-800 shrink-0">
                <Tag className="w-[18px] h-[18px]" />
              </span>
              <span className="text-body-sm font-bold text-ragab-ink-800">
                {t.home.todaysOffers}
              </span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
