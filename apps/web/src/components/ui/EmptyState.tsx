'use client';

import React from 'react';
import { Button } from './Button';
import Link from 'next/link';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 bg-white rounded-xl border border-ragab-ink-200 my-6">
      <div className="w-16 h-16 rounded-full bg-ragab-cream flex items-center justify-center text-ragab-ink-800 mb-4 shadow-subtle">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-ragab-ink-800 font-arabic mb-1">{title}</h3>
      <p className="text-sm text-ragab-ink-500 font-arabic max-w-md mb-6">{description}</p>

      {actionLabel && (
        actionHref ? (
          <Link href={actionHref}>
            <Button variant="primary">{actionLabel}</Button>
          </Link>
        ) : (
          <Button variant="primary" onClick={onAction}>
            {actionLabel}
          </Button>
        )
      )}
    </div>
  );
};
