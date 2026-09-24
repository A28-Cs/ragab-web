'use client';

import React from 'react';
import { Truck } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

/** Slim announcement strip above the header. */
export const TopBanner: React.FC = () => {
  const { isRTL } = useLanguage();

  return (
    <div className="bg-ragab-ink-800 text-white text-caption select-none">
      <div className="container-page flex items-center justify-center gap-2 h-9 font-arabic">
        <Truck className="w-4 h-4 text-ragab-brand-500 shrink-0" />
        <p className="font-semibold text-center truncate">
          {isRTL
            ? 'توصيل مجاني للطلبات فوق 300 ج.م — خلال 30 دقيقة لباب بيتك'
            : 'Free delivery on orders above 300 EGP — within 30 minutes to your door'}
        </p>
      </div>
    </div>
  );
};
