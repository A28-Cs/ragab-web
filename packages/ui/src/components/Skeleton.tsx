import React from 'react';
import { cn } from '@ragab/utils';

export interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className }) => {
  return (
    <div className={cn('animate-pulse bg-gray-200 rounded-md', className)} />
  );
};
