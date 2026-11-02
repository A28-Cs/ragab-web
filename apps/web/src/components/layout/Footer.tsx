'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MapPin, Phone, Clock, MessageSquare, Code2, ChevronDown } from 'lucide-react';
import { cn } from '@ragab/utils';
import { RagabLogo } from '../ui/RagabLogo';
import { useLanguage } from '../../context/LanguageContext';
import { getCategories } from '../../services/categoryService';
import { getDeliveryZones } from '../../services/offerService';
import { Category, DeliveryZone } from '../../types';
import { featuredCategories } from '../../lib/categoryPresentation';

const headingCls = 'text-body font-bold text-white font-arabic';
const linkCls =
  'block py-1.5 text-body-sm text-ragab-ink-300 hover:text-ragab-brand-500 transition-colors font-arabic';

export const Footer: React.FC = () => {
  const { t, isRTL } = useLanguage();
  const [categories, setCategories] = useState<Category[]>([]);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
    getDeliveryZones().then(setZones).catch(() => {});
  }, []);

  const departments = useMemo(() => featuredCategories(categories, 5), [categories]);

  const toggleSection = (id: string) => {
    setExpandedSection((prev) => (prev === id ? null : id));
  };

  return (
    <footer className="bg-ragab-ink-800 text-white border-t-4 border-ragab-brand-500 pb-[calc(var(--bottom-nav-h)+1.25rem)] md:pb-8">
      <div className="container-page pt-6 sm:pt-10 md:pt-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-y-4 md:gap-x-6 md:gap-y-10 pb-6 md:pb-10">
          {/* Brand */}
          <div className="space-y-3 pb-3 md:pb-0 border-b border-white/10 md:border-b-0">
            <RagabLogo theme="dark" size="md" />
            <p className="text-caption sm:text-body-sm text-ragab-ink-300 leading-relaxed font-arabic max-w-sm line-clamp-2 md:line-clamp-none">
              {t.footer.aboutText}
            </p>
            <p className="text-caption sm:text-body-sm text-ragab-brand-500 font-bold font-arabic">
              «{t.common.slogan}»
            </p>
          </div>

          {/* Departments */}
          <nav aria-label={t.footer.categories} className="border-b border-white/10 md:border-b-0 pb-3 md:pb-0">
            <button
              type="button"
              onClick={() => toggleSection('categories')}
              className="w-full flex items-center justify-between text-start md:pointer-events-none py-1 md:py-0 md:mb-4 focus-ring rounded-lg"
              aria-expanded={expandedSection === 'categories'}
            >
              <h4 className={headingCls}>{t.footer.categories}</h4>
              <ChevronDown
                className={cn(
                  'w-4 h-4 text-ragab-brand-500 transition-transform duration-200 md:hidden',
                  expandedSection === 'categories' && 'rotate-180'
                )}
              />
            </button>
            <div
              className={cn(
                'overflow-hidden transition-all duration-300 md:!max-h-none md:!opacity-100',
                expandedSection === 'categories'
                  ? 'max-h-80 opacity-100 pt-2 md:pt-0'
                  : 'max-h-0 opacity-0 md:max-h-none'
              )}
            >
              <ul>
                {departments.map((c) => (
                  <li key={c.id}>
                    <Link href={`/category/${c.slug}`} className={linkCls}>
                      {isRTL ? c.nameAr : c.nameEn}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/categories" className={`${linkCls} text-ragab-brand-500 font-bold`}>
                    {t.common.viewAllCategories}
                  </Link>
                </li>
              </ul>
            </div>
          </nav>

          {/* Customer service */}
          <div className="border-b border-white/10 md:border-b-0 pb-3 md:pb-0">
            <button
              type="button"
              onClick={() => toggleSection('service')}
              className="w-full flex items-center justify-between text-start md:pointer-events-none py-1 md:py-0 md:mb-4 focus-ring rounded-lg"
              aria-expanded={expandedSection === 'service'}
            >
              <h4 className={headingCls}>{t.footer.customerService}</h4>
              <ChevronDown
                className={cn(
                  'w-4 h-4 text-ragab-brand-500 transition-transform duration-200 md:hidden',
                  expandedSection === 'service' && 'rotate-180'
                )}
              />
            </button>
            <div
              className={cn(
                'overflow-hidden transition-all duration-300 md:!max-h-none md:!opacity-100',
                expandedSection === 'service'
                  ? 'max-h-80 opacity-100 pt-2 md:pt-0'
                  : 'max-h-0 opacity-0 md:max-h-none'
              )}
            >
              <ul className="space-y-2 text-caption sm:text-body-sm text-ragab-ink-300 font-arabic">
                <li className="flex items-center gap-2.5">
                  <Phone className="w-4 h-4 text-ragab-brand-500 shrink-0" />
                  <a dir="ltr" href="tel:+201012345678" className="font-bold text-white hover:text-ragab-brand-500 transition-colors">
                    +20 10 1234 5678
                  </a>
                </li>
                <li className="flex items-center gap-2.5">
                  <MessageSquare className="w-4 h-4 text-ragab-brand-500 shrink-0" />
                  <a
                    href="https://wa.me/201012345678"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white transition-colors"
                  >
                    {t.common.whatsapp}: <span dir="ltr">01012345678</span>
                  </a>
                </li>
                <li className="flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-ragab-brand-500 shrink-0 mt-0.5" />
                  <span>{t.footer.workingHours}</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-ragab-brand-500 shrink-0 mt-0.5" />
                  <span>{t.common.location}</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Delivery zones */}
          <div className="pb-3 md:pb-0">
            <button
              type="button"
              onClick={() => toggleSection('zones')}
              className="w-full flex items-center justify-between text-start md:pointer-events-none py-1 md:py-0 md:mb-4 focus-ring rounded-lg"
              aria-expanded={expandedSection === 'zones'}
            >
              <h4 className={headingCls}>{t.footer.deliveryZones}</h4>
              <ChevronDown
                className={cn(
                  'w-4 h-4 text-ragab-brand-500 transition-transform duration-200 md:hidden',
                  expandedSection === 'zones' && 'rotate-180'
                )}
              />
            </button>
            <div
              className={cn(
                'overflow-hidden transition-all duration-300 md:!max-h-none md:!opacity-100',
                expandedSection === 'zones'
                  ? 'max-h-96 opacity-100 pt-2 md:pt-0'
                  : 'max-h-0 opacity-0 md:max-h-none'
              )}
            >
              <ul className="space-y-1.5 text-caption sm:text-body-sm font-arabic">
                {zones.map((z) => (
                  <li key={z.id} className="flex items-center justify-between gap-3 py-0.5">
                    <span className="text-ragab-ink-300">{isRTL ? z.nameAr : z.nameEn}</span>
                    <span className="font-bold text-ragab-brand-500 tabular-nums whitespace-nowrap">
                      {z.deliveryFee === 0 ? (isRTL ? 'مجاني' : 'Free') : `${z.deliveryFee} ${t.common.egp}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-4 md:pt-6 border-t border-white/10 text-caption text-ragab-ink-400 flex flex-col sm:flex-row items-center justify-between gap-2.5 font-arabic">
          <div>{t.footer.copyright}</div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link href="/privacy" className="hover:text-white transition-colors py-0.5 inline-block">
              {t.footer.privacy}
            </Link>
            <span>·</span>
            <Link href="/terms" className="hover:text-white transition-colors py-0.5 inline-block">
              {t.footer.terms}
            </Link>
            <span>·</span>
            <a
              href={isRTL ? 'https://taqatoo.web.app/?lang=ar' : 'https://taqatoo.web.app/?lang=en'}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 py-0.5 hover:text-white transition-colors"
            >
              <Code2 className="w-3.5 h-3.5 text-ragab-brand-500 shrink-0" />
              <span>{isRTL ? 'تم التطوير بواسطة' : 'Developed by'}</span>
              <span className="font-bold text-ragab-brand-500 underline-offset-4 group-hover:underline font-arabic">
                {isRTL ? 'التقاطع' : 'Taqatoo'}
              </span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
