'use client';

import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { Category } from '../../types';
import { Chip } from '../ui/Chip';

interface SubcategoryChipsProps {
  /** The full category list (flat — parent/child told apart by `parentId`). */
  categories: Category[];
  /** The department the visitor is currently browsing (its own product listing already
   *  rolls up every subcategory's products — see the server's `buildConditions`). */
  parent?: Category;
  /** Currently active `categoryId` filter — the parent's own id when nothing narrower
   *  is picked, or one child's id once the visitor taps a chip. */
  activeCategoryId?: string;
  onSelect: (categoryId: string) => void;
}

/**
 * Row of chips to narrow a department's (already rolled-up) listing down to one of its
 * subcategories — e.g. browsing "المشروبات" shows [الكل، مياه، قهوة، شاي، ...]. Renders
 * nothing for a department with no subcategories, so it's a no-op everywhere else.
 */
export const SubcategoryChips: React.FC<SubcategoryChipsProps> = ({ categories, parent, activeCategoryId, onSelect }) => {
  const { t, isRTL } = useLanguage();
  if (!parent) return null;
  const children = categories.filter((c) => c.parentId === parent.id);
  if (children.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
      <Chip selected={!activeCategoryId || activeCategoryId === parent.id} onClick={() => onSelect(parent.id)}>
        {t.products.allCategories}
      </Chip>
      {children.map((c) => (
        <Chip key={c.id} selected={activeCategoryId === c.id} onClick={() => onSelect(c.id)}>
          {isRTL ? c.nameAr : c.nameEn}
        </Chip>
      ))}
    </div>
  );
};
