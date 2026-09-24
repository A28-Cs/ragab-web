/**
 * Ragab brand palette.
 * Single source of truth alongside `apps/web/tailwind.config.ts`
 * (the Tailwind `ragab.*` namespace mirrors these values).
 */
export const RAGAB_BRAND_COLORS = {
  // Primary palette
  yellow: '#F4C430',
  yellowHover: '#E2B320',
  yellowSecondary: '#FFD766',
  cream: '#FFF6E1',
  creamSoft: '#FFFDF7',
  neutralSoft: '#FAF9F6',
  charcoal: '#1F1F1F',
  white: '#FFFFFF',

  // Brand scale (mirrors tailwind `ragab-brand-*`)
  brandScale: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FFD766',
    500: '#F4C430',
    600: '#E2B320',
    700: '#B88910',
  },

  // Semantic mappings
  bg: '#FAF9F6',
  surface: '#FFFFFF',
  textPrimary: '#1F1F1F',
  textSecondary: '#4B5563',
  textMuted: '#6B7280', // matches tailwind `ragab-ink-500` — min contrast-safe muted text
  borderDefault: '#E5E7EB',
  borderBrand: '#F4C430',
};
