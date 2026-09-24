import React from 'react';

interface WordmarkProps {
  color?: string;
  className?: string;
}

export const RagabWordmarkArabic: React.FC<WordmarkProps> = ({
  color = '#1e293b',
  className = '',
}) => {
  return (
    <span
      className={`font-arabic font-extrabold tracking-tight select-none ${className}`}
      style={{ color }}
    >
      صيدلية رجب
    </span>
  );
};
