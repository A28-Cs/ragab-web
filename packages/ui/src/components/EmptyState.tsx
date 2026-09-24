import React from 'react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionText?: string;
  onActionClick?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionText,
  onActionClick,
}) => {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 bg-white rounded-xl border border-dashed border-gray-300">
      {icon && <div className="p-4 bg-ragab-cream rounded-full mb-4 text-ragab-charcoal">{icon}</div>}
      <h3 className="text-lg font-extrabold text-ragab-charcoal font-arabic">{title}</h3>
      {description && <p className="text-sm text-ragab-muted font-arabic mt-1 max-w-sm">{description}</p>}
      {actionText && onActionClick && (
        <Button onClick={onActionClick} className="mt-5" variant="primary">
          {actionText}
        </Button>
      )}
    </div>
  );
};
