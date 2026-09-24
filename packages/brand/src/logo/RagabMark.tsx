import React from 'react';
import { LogoBaseProps } from './types';

export const RagabMark: React.FC<LogoBaseProps> = ({
  size = 'md',
  color = '#14b8a6',
  className = '',
}) => {
  const dimensions = {
    xs: 24,
    sm: 32,
    md: 40,
    lg: 56,
    xl: 72,
  };

  const px = dimensions[size];

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Ragab Pharmacy Mark"
    >
      <rect width="100" height="100" rx="20" fill={color} />
      <path
        d="M40 25 h20 v15 h15 v20 h-15 v15 h-20 v-15 h-15 v-20 h15 Z"
        fill="#FFFFFF"
      />
    </svg>
  );
};