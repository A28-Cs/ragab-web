import React from 'react';

interface WordmarkProps {
  color?: string;
  className?: string;
}

export const RagabWordmarkEnglish: React.FC<WordmarkProps> = ({
  color = '#1e293b',
  className = '',
}) => {
  return (
    <span
      className={`font-english font-bold uppercase tracking-wider select-none ${className}`}
      style={{ color }}
    >
      RAGAB PHARMACY
    </span>
  );
};
