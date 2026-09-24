import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@ragab/utils';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionText?: string;
  actionHref?: string;
  onActionClick?: () => void;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  actionText,
  onActionClick,
  className,
}) => {
  return (
    <div className={cn('flex items-end justify-between mb-6', className)}>
      <div>
        <h2 className="text-xl md:text-2xl font-extrabold text-ragab-charcoal font-arabic">
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm text-ragab-muted font-arabic mt-1">
            {subtitle}
          </p>
        )}
      </div>

      {actionText && (
        <button
          onClick={onActionClick}
          className="inline-flex items-center gap-1 text-sm font-bold text-ragab-charcoal hover:text-ragab-yellow-hover transition-colors font-arabic group"
        >
          <span>{actionText}</span>
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
        </button>
      )}
    </div>
  );
};
