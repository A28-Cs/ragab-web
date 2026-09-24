'use client';

import React from 'react';
import { RagabMark } from '@ragab/brand';

interface RagabLogoProps {
  variant?: 'full' | 'arabic' | 'english' | 'mark';
  theme?: 'light' | 'dark';
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const RagabLogo: React.FC<RagabLogoProps> = ({
  variant = 'full',
  theme = 'light',
  className = '',
  size = 'md',
}) => {
  const isDark = theme === 'dark';
  const textColor = isDark ? '#FFFFFF' : '#1e293b';
  const subtextColor = isDark ? '#cbd5e1' : '#64748b';

  const heights = {
    sm: 'h-8',
    md: 'h-10',
    lg: 'h-14',
  };

  const markSizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  };

  return (
    <div className={`inline-flex items-center gap-2 select-none ${heights[size]} ${className}`}>
      {/* Brand mark: teal tile + pharmacy cross (from @ragab/brand). */}
      <RagabMark
        size={size}
        className={`${markSizes[size]} shrink-0 group-hover:scale-105 transition-transform`}
      />

      {variant !== 'mark' && (
        <div className="flex flex-col justify-center">
          <div className="flex items-baseline gap-1.5 leading-none">
            <span
              className="text-2xl font-bold tracking-tight font-arabic"
              style={{ color: textColor }}
            >
              رجب
            </span>
            <span
              className="text-xs font-semibold tracking-wider font-english uppercase opacity-75"
              style={{ color: textColor }}
            >
              Ragab
            </span>
          </div>
          <span
            className="text-[10px] tracking-widest font-semibold font-arabic uppercase mt-0.5"
            style={{ color: subtextColor }}
          >
            صيدلية • PHARMACY
          </span>
        </div>
      )}
    </div>
  );
};
