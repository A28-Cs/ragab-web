'use client';

import React from 'react';
import { cn } from '@ragab/utils';

interface AvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizes = {
  sm: 'w-8 h-8 text-caption',
  md: 'w-10 h-10 text-body-sm',
  lg: 'w-14 h-14 text-h3',
  xl: 'w-20 h-20 text-h2',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '؟';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] ?? '') + (parts[1][0] ?? '');
}

export const Avatar: React.FC<AvatarProps> = ({ name, src, size = 'md', className = '' }) => {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 font-bold select-none',
        'bg-ragab-brand-100 text-ragab-ink-800 border border-ragab-brand-200',
        sizes[size],
        className
      )}
      aria-hidden={false}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span className="font-arabic">{initials(name)}</span>
      )}
    </span>
  );
};
