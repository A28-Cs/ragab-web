export type LogoVariant =
  | 'primary_ar'
  | 'bilingual'
  | 'wordmark_ar'
  | 'wordmark_en'
  | 'mark'
  | 'horizontal'
  | 'stacked'
  | 'dark'
  | 'light'
  | 'mono_dark'
  | 'mono_light';

export type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface LogoBaseProps {
  variant?: LogoVariant;
  size?: LogoSize;
  color?: string;
  showEnglish?: boolean;
  showTagline?: boolean;
  className?: string;
}
