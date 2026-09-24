'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { cn } from '@ragab/utils';
import { Badge } from '../ui/Badge';
import { useLanguage } from '../../context/LanguageContext';

interface ProductGalleryProps {
  /** Main image + optional extra shots */
  images: string[];
  alt: string;
  discountPercentage?: number;
}

/**
 * PDP gallery: square main image on a warm sunken surface + thumbnail strip.
 * Falls back to a single image when no gallery exists.
 */
export const ProductGallery: React.FC<ProductGalleryProps> = ({
  images,
  alt,
  discountPercentage,
}) => {
  const { t, isRTL } = useLanguage();
  const [active, setActive] = useState(0);

  // Reset when the product changes
  useEffect(() => {
    setActive(0);
  }, [images]);

  const current = images[Math.min(active, images.length - 1)];

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div className="relative w-full aspect-square bg-ragab-surface-sunken rounded-3xl overflow-hidden border border-ragab-ink-200">
        <Image
          key={current}
          src={current}
          alt={alt}
          fill
          priority
          sizes="(max-width: 768px) 100vw, 560px"
          className="object-contain p-8 md:p-12"
        />
        {discountPercentage !== undefined && discountPercentage > 0 && (
          <div className="absolute top-4 start-4">
            <Badge variant="discount" size="md">
              {isRTL ? `${t.common.discount} ${discountPercentage}%` : `${discountPercentage}% ${t.common.discount}`}
            </Badge>
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="scroll-rail">
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`صورة ${i + 1}`}
              aria-current={active === i}
              className={cn(
                'relative w-16 h-16 rounded-xl overflow-hidden border-2 transition-colors bg-ragab-surface-sunken shrink-0 focus-ring',
                active === i
                  ? 'border-ragab-brand-500'
                  : 'border-ragab-ink-200 hover:border-ragab-ink-400'
              )}
            >
              <Image src={src} alt="" fill sizes="64px" className="object-contain p-1.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
