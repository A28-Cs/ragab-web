'use client';

import React from 'react';
import {
  Pill,
  Scissors,
  Sparkles,
  Droplets,
  Baby,
  Palette,
  Stethoscope,
  Leaf,
  Package,
  Heart,
  LayoutGrid,
} from 'lucide-react';
import { cn } from '@ragab/utils';

export interface CategoryTheme {
  icon: React.ComponentType<{ className?: string }>;
  bg: string;
  text: string;
  border: string;
}

export function getCategoryTheme(category: { iconName?: string; slug?: string; nameAr?: string }): CategoryTheme {
  const icon = (category.iconName || '').toLowerCase();
  const slug = (category.slug || '').toLowerCase();
  const name = category.nameAr || '';

  // 1. الأدوية (Medications)
  if (icon === 'pill' || slug.includes('medication') || name.includes('أدوية') || name.includes('علاج')) {
    return {
      icon: Pill,
      bg: 'bg-rose-50',
      text: 'text-rose-600',
      border: 'border-rose-200/80',
    };
  }

  // 2. العناية بالشعر (Hair Care)
  if (icon === 'scissors' || slug.includes('hair') || name.includes('شعر')) {
    return {
      icon: Scissors,
      bg: 'bg-purple-50',
      text: 'text-purple-600',
      border: 'border-purple-200/80',
    };
  }

  // 3. العناية بالبشرة (Skin Care)
  if (icon === 'sparkles' || slug.includes('skin') || name.includes('بشرة')) {
    return {
      icon: Sparkles,
      bg: 'bg-pink-50',
      text: 'text-pink-600',
      border: 'border-pink-200/80',
    };
  }

  // 4. العناية اليومية (Daily Essentials)
  if (icon === 'spray-can' || icon === 'droplets' || slug.includes('daily') || name.includes('يومية') || name.includes('استحمام') || name.includes('نظافة')) {
    return {
      icon: Droplets,
      bg: 'bg-teal-50',
      text: 'text-teal-600',
      border: 'border-teal-200/80',
    };
  }

  // 5. الأم والطفل (Mother & Baby)
  if (icon === 'baby' || slug.includes('baby') || slug.includes('mother') || name.includes('طفل') || name.includes('أم')) {
    return {
      icon: Baby,
      bg: 'bg-amber-50',
      text: 'text-amber-600',
      border: 'border-amber-200/80',
    };
  }

  // 6. المكياج والاكسسوارات (Makeup & Accessories)
  if (icon === 'palette' || slug.includes('makeup') || slug.includes('accessories') || name.includes('مكياج') || name.includes('تجميل')) {
    return {
      icon: Palette,
      bg: 'bg-fuchsia-50',
      text: 'text-fuchsia-600',
      border: 'border-fuchsia-200/80',
    };
  }

  // 7. المستلزمات الطبية (Medical Supplies)
  if (icon === 'heart-pulse' || icon === 'stethoscope' || slug.includes('medical') || name.includes('مستلزمات') || name.includes('أجهزة')) {
    return {
      icon: Stethoscope,
      bg: 'bg-blue-50',
      text: 'text-blue-600',
      border: 'border-blue-200/80',
    };
  }

  // 8. الفيتامينات والمكملات (Vitamins & Supplements)
  if (icon === 'leaf' || slug.includes('vitamin') || slug.includes('supplement') || name.includes('فيتامين') || name.includes('مكمل')) {
    return {
      icon: Leaf,
      bg: 'bg-emerald-50',
      text: 'text-emerald-600',
      border: 'border-emerald-200/80',
    };
  }

  // 9. منتجات أخرى (Other Products)
  if (icon === 'package' || slug.includes('other') || name.includes('أخرى')) {
    return {
      icon: Package,
      bg: 'bg-slate-50',
      text: 'text-slate-600',
      border: 'border-slate-200/80',
    };
  }

  // Defaults:
  if (icon === 'heart') {
    return {
      icon: Heart,
      bg: 'bg-red-50',
      text: 'text-red-600',
      border: 'border-red-200/80',
    };
  }

  return {
    icon: LayoutGrid,
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200/80',
  };
}

export const CategoryIcon: React.FC<{
  category: { iconName?: string; slug?: string; nameAr?: string };
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  withBadge?: boolean;
}> = ({ category, size = 'md', className = '', withBadge = false }) => {
  const theme = getCategoryTheme(category);
  const IconComponent = theme.icon;

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  const badgeSizes = {
    sm: 'w-7 h-7 rounded-lg',
    md: 'w-12 h-12 rounded-xl',
    lg: 'w-14 h-14 rounded-2xl',
  };

  if (!withBadge) {
    return <IconComponent className={cn(iconSizes[size], theme.text, className)} />;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center shrink-0 border shadow-2xs transition-transform duration-200',
        badgeSizes[size],
        theme.bg,
        theme.text,
        theme.border,
        className
      )}
    >
      <IconComponent className={iconSizes[size]} />
    </span>
  );
};
