import React from 'react';
import { LogoBaseProps } from './types';
import { RagabMark } from './RagabMark';
import { RagabWordmarkArabic } from './RagabWordmarkArabic';
import { RagabWordmarkEnglish } from './RagabWordmarkEnglish';
import { RagabLogoHorizontal } from './RagabLogoHorizontal';
import { RagabLogoStacked } from './RagabLogoStacked';

export const RagabLogo: React.FC<LogoBaseProps> = ({
  variant = 'horizontal',
  size = 'md',
  color,
  showEnglish = false,
  showTagline = false,
  className = '',
}) => {
  switch (variant) {
    case 'mark':
      return <RagabMark size={size} color={color || '#14b8a6'} className={className} />;

    case 'wordmark_ar':
      return (
        <RagabWordmarkArabic
          color={color || '#1e293b'}
          className={`${size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-3xl' : 'text-2xl'} ${className}`}
        />
      );

    case 'wordmark_en':
      return (
        <RagabWordmarkEnglish
          color={color || '#1e293b'}
          className={`${size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-base'} ${className}`}
        />
      );

    case 'bilingual':
      return (
        <RagabLogoHorizontal
          size={size}
          color={color || '#1e293b'}
          showEnglish={true}
          showTagline={showTagline}
          className={className}
        />
      );

    case 'stacked':
      return (
        <RagabLogoStacked
          size={size}
          color={color || '#1e293b'}
          showEnglish={showEnglish}
          showTagline={showTagline}
          className={className}
        />
      );

    case 'dark':
      return (
        <RagabLogoHorizontal
          size={size}
          color="#FFFFFF"
          showEnglish={showEnglish}
          showTagline={showTagline}
          className={className}
        />
      );

    case 'light':
      return (
        <RagabLogoHorizontal
          size={size}
          color="#1e293b"
          showEnglish={showEnglish}
          showTagline={showTagline}
          className={className}
        />
      );

    case 'mono_dark':
      return (
        <RagabLogoHorizontal
          size={size}
          color="#1e293b"
          showEnglish={showEnglish}
          showTagline={showTagline}
          className={className}
        />
      );

    case 'mono_light':
      return (
        <RagabLogoHorizontal
          size={size}
          color="#FFFFFF"
          showEnglish={showEnglish}
          showTagline={showTagline}
          className={className}
        />
      );

    case 'primary_ar':
    case 'horizontal':
    default:
      return (
        <RagabLogoHorizontal
          size={size}
          color={color || '#1e293b'}
          showEnglish={showEnglish}
          showTagline={showTagline}
          className={className}
        />
      );
  }
};
