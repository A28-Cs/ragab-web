'use client';

import React from 'react';
import Link from 'next/link';
import { Globe, ArrowLeft } from 'lucide-react';
import { RagabLogo } from '../ui/RagabLogo';
import { useLanguage } from '../../context/LanguageContext';

interface AuthShellProps {
  children: React.ReactNode;
  /** Optional heading + subheading shown above the card content */
  title?: string;
  subtitle?: string;
}

export const AuthShell: React.FC<AuthShellProps> = ({ children, title, subtitle }) => {
  const { t, toggleLanguage } = useLanguage();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-ragab-cream-soft font-arabic">
      {/* Top bar */}
      <header className="flex items-center justify-between container-page py-4">
        <Link href="/" aria-label={t.common.backToHome}>
          <RagabLogo variant="full" size="sm" />
        </Link>
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleLanguage}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-caption font-bold text-ragab-ink-600 hover:bg-ragab-ink-100 transition-colors focus-ring"
          >
            <Globe className="w-4 h-4" />
            {t.navigation.languageToggle}
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-caption font-semibold text-ragab-ink-500 hover:bg-ragab-ink-100 transition-colors focus-ring"
          >
            {t.common.backToHome}
            <ArrowLeft className="w-4 h-4 ltr:rotate-180" />
          </Link>
        </div>
      </header>

      {/* Centered content */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {(title || subtitle) && (
            <div className="text-center mb-6">
              {title && <h1 className="text-h1 text-ragab-ink-800">{title}</h1>}
              {subtitle && <p className="text-body-sm text-ragab-ink-500 mt-2">{subtitle}</p>}
            </div>
          )}
          <div className="bg-ragab-surface rounded-2xl border border-ragab-ink-200 shadow-card p-6 sm:p-7">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
