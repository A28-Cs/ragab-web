'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Tag, ArrowLeft, Clock, X, Loader2 } from 'lucide-react';
import { Offer } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

interface OfferCardProps {
  offer: Offer;
  onDelete?: (offer: Offer) => void;
  isDeleting?: boolean;
}

/**
 * Offer themes resolved to full literal class strings so Tailwind's
 * content scanner sees them (fixes the purged-gradient bug where
 * classes coming from mockData rendered as transparent banners).
 */
const themes: Record<Offer['theme'], string> = {
  amber: 'bg-gradient-to-l from-amber-400 via-ragab-brand-400 to-ragab-brand-300',
  gold: 'bg-gradient-to-l from-ragab-brand-500 via-amber-300 to-ragab-brand-200',
  sunset: 'bg-gradient-to-l from-orange-300 via-amber-300 to-ragab-brand-300',
};

function useCountdown(expiryDate?: string): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!expiryDate) return;
    const tick = () => {
      const diff = new Date(expiryDate).getTime() - Date.now();
      if (diff <= 0) {
        setLabel(null);
        return;
      }
      const days = Math.floor(diff / 86_400_000);
      const hours = Math.floor((diff % 86_400_000) / 3_600_000);
      const minutes = Math.floor((diff % 3_600_000) / 60_000);
      setLabel(days > 0 ? `${days} يوم ${hours} س` : `${hours} س ${minutes} د`);
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [expiryDate]);

  return label;
}

/**
 * Compact promo strip (fixed short height, one line of copy) — the earlier
 * version was a tall poster-style card (min-h-176px, big heading, big CTA
 * button, giant watermark) that made a row of 2-3 offers dominate the whole
 * screen before any real product appeared. This is one glanceable banner,
 * not a landing page.
 */
export const OfferCard: React.FC<OfferCardProps> = ({ offer, onDelete, isDeleting }) => {
  const { isRTL } = useLanguage();
  const countdown = useCountdown(offer.expiryDate);

  const title = isRTL ? offer.titleAr : offer.titleEn;
  const subtitle = isRTL ? offer.subtitleAr : offer.subtitleEn;
  const badge = isRTL ? offer.discountBadgeAr : offer.discountBadgeEn;

  // Offers deep-link to their own slug when a target exists, otherwise the offers hub
  const href = offer.categoryId
    ? `/category/${offer.categoryId}`
    : offer.productId
      ? `/product/${offer.productId}`
      : '/offers';

  return (
    <Link
      href={href}
      className={`group relative overflow-hidden rounded-2xl h-28 sm:h-32 flex items-center gap-3 p-4 sm:p-5 ${themes[offer.theme]} text-ragab-ink-800 shadow-card hover:shadow-card-hover transition-shadow focus-ring`}
    >
      <div className="relative z-10 flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1 sm:mb-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/90 text-caption font-bold shadow-subtle shrink-0">
            <Tag className="w-3 h-3 text-ragab-brand-700" />
            {badge}
          </span>
          {countdown && (
            <span className="hidden xs:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-ragab-ink-800/90 text-white text-caption font-bold shrink-0">
              <Clock className="w-3 h-3" />
              {countdown}
            </span>
          )}
        </div>

        <h3 className="text-body sm:text-h3 font-extrabold font-arabic leading-snug truncate">
          {title}
        </h3>
        <p className="text-caption sm:text-body-sm font-semibold opacity-75 font-arabic truncate mt-0.5">
          {subtitle}
        </p>
      </div>

      <span
        aria-hidden="true"
        className="relative z-10 shrink-0 inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-ragab-ink-800 text-white group-hover:bg-black transition-colors"
      >
        <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 ltr:rotate-180 group-hover:-translate-x-0.5 ltr:group-hover:translate-x-0.5 transition-transform" />
      </span>

      {/* Cancel/Delete Offer Button for Store Manager / Owner */}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(offer);
          }}
          disabled={isDeleting}
          title={isRTL ? 'إلغاء هذا العرض' : 'Cancel this offer'}
          className="relative z-20 shrink-0 inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-md transition-all focus-ring active:scale-95 border border-red-700"
        >
          {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4 stroke-[2.5]" />}
        </button>
      )}

      {/* Decorative watermark — small, clipped inside, never causes overflow */}
      <div className="absolute -bottom-3 -start-2 opacity-10 text-white pointer-events-none select-none font-bold text-5xl font-arabic hidden md:block">
        رجب
      </div>
    </Link>
  );
};
