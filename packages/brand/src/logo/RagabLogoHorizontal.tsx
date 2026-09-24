import React from 'react';
import { LogoBaseProps } from './types';
import { RagabMark } from './RagabMark';
import { RagabWordmarkArabic } from './RagabWordmarkArabic';
import { RagabWordmarkEnglish } from './RagabWordmarkEnglish';

export const RagabLogoHorizontal: React.FC<LogoBaseProps> = ({
  size = 'md',
  color = '#1e293b',
  showEnglish = false,
  showTagline = false,
  className = '',
}) => {
  const textSizes = {
    xs: 'text-lg',
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl',
    xl: 'text-4xl',
  };

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <RagabMark size={size} />
      <div className="flex flex-col leading-tight">
        <div className="flex items-baseline gap-2">
          <RagabWordmarkArabic
            color={color}
            className={textSizes[size]}
          />
          {showEnglish && (
            <RagabWordmarkEnglish
              color={color}
              className="text-xs opacity-75"
            />
          )}
        </div>
        {showTagline && (
          <span className="text-[10px] font-medium text-ragab-muted font-arabic">
            صحتك تهمنا
          </span>
        )}
      </div>
    </div>
  );
};
