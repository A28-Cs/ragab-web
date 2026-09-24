import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
    '../../packages/brand/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      screens: {
        xs: '400px',
        '3xl': '1720px',
      },
      colors: {
        ragab: {
          // ===== Brand scale (Pharmacy Teal/Green identity) =====
          brand: {
            50: '#f0fdfa',
            100: '#ccfbf1',
            200: '#99f6e4',
            300: '#5eead4',
            400: '#2dd4bf',
            500: '#14b8a6', // identity teal
            600: '#0d9488',
            700: '#0f766e',
          },
          // ===== Neutral / ink scale (cool greys) =====
          ink: {
            50: '#f8fafc',
            100: '#f1f5f9',
            200: '#e2e8f0',
            300: '#cbd5e1',
            400: '#94a3b8',
            500: '#64748b',
            600: '#475569',
            700: '#334155',
            800: '#1e293b', // slate
            900: '#0f172a',
          },
          // ===== Surfaces =====
          bg: '#F8FAFC',
          surface: '#FFFFFF',
          'surface-sunken': '#F1F5F9',
          cream: '#f0fdfa',
          'cream-soft': '#F8FAFC',
          // ===== Semantic =====
          success: '#15803D',
          'success-soft': '#ECFDF5',
          danger: '#DC2626',
          'danger-soft': '#FEF2F2',
          warning: '#D97706',
          'warning-soft': '#FFFBEB',
          info: '#2563EB',
          'info-soft': '#EFF6FF',
          // ===== Legacy aliases =====
          yellow: '#14b8a6',
          'yellow-hover': '#0d9488',
          'yellow-light': '#2dd4bf',
          charcoal: '#1e293b',
          muted: '#64748b',
          border: '#e2e8f0',
          dark: '#0f172a',
        },
      },
      fontFamily: {
        arabic: ['var(--font-cairo)', 'Cairo', 'Tajawal', 'sans-serif'],
        english: ['var(--font-poppins)', 'Poppins', 'sans-serif'],
        sans: ['var(--font-cairo)', 'Cairo', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['clamp(2rem, 1.3rem + 3vw, 3.25rem)', { lineHeight: '1.15', fontWeight: '800' }],
        h1: ['clamp(1.5rem, 1.15rem + 1.6vw, 2rem)', { lineHeight: '1.25', fontWeight: '800' }],
        h2: ['clamp(1.375rem, 1.1rem + 1vw, 1.75rem)', { lineHeight: '1.3', fontWeight: '800' }],
        h3: ['1.125rem', { lineHeight: '1.4', fontWeight: '700' }],
        body: ['0.9375rem', { lineHeight: '1.7' }],
        'body-sm': ['0.875rem', { lineHeight: '1.6' }],
        label: ['0.8125rem', { lineHeight: '1.4', fontWeight: '600' }],
        caption: ['0.75rem', { lineHeight: '1.45', fontWeight: '500' }],
        price: ['1.0625rem', { lineHeight: '1.2', fontWeight: '800' }],
        'price-lg': ['1.25rem', { lineHeight: '1.2', fontWeight: '800' }],
      },
      borderRadius: {
        sm: '8px',
        md: '10px',
        lg: '14px',
        xl: '18px',
        '2xl': '24px',
        '3xl': '32px',
      },
      boxShadow: {
        subtle: '0 1px 2px rgba(38, 35, 31, 0.05)',
        card: '0 2px 10px rgba(38, 35, 31, 0.06)',
        'card-hover': '0 10px 28px -8px rgba(38, 35, 31, 0.14)',
        popover: '0 12px 36px -8px rgba(38, 35, 31, 0.16)',
        sticky: '0 -4px 16px -4px rgba(38, 35, 31, 0.08)',
      },
    },
  },
  plugins: [animate],
};

export default config;
