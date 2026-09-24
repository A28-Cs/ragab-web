import React from 'react';
import { LogoBaseProps } from './types';
import { RagabMark } from './RagabMark';
import { RagabWordmarkArabic } from './RagabWordmarkArabic';
import { RagabWordmarkEnglish } from './RagabWordmarkEnglish';

export const RagabLogoStacked: React.FC<LogoBaseProps> = ({
  size = 'lg',
  color = '#1e293b',
  showEnglish = false,
  showTagline = false,
  className = '',
}) => {
  return (
    <div className={`inline-flex flex-col items-center text-center gap-2 ${className}`}>
      <RagabMark size={size} />
      <div className="flex flex-col items-center">
        <RagabWordmarkArabic color={color} className="text-3xl" />
        {showEnglish && (
          <RagabWordmarkEnglish color={color} className="text-xs tracking-widest opacity-80" />
        )}
        {showTagline && (
          <span className="text-xs mt-1 font-medium text-ragab-muted font-arabic">
            صحتك تهمنا
          </span>
        )}
      </div>
    </div>
  );
};
