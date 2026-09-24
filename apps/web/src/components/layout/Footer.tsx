'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MapPin, Phone, Clock, MessageSquare, Code2 } from 'lucide-react';
import { RagabLogo } from '../ui/RagabLogo';
import { useLanguage } from '../../context/LanguageContext';
import { getCategories } from '../../services/categoryService';
import { getDeliveryZones } from '../../services/offerService';
import { Category, DeliveryZone } from '../../types';
import { featuredCategories } from '../../lib/categoryPresentation';

const headingCls = 'text-body font-bold text-white mb-4 font-arabic';
const linkCls =
  'block py-1.5 text-body-sm text-ragab-ink-300 hover:text-ragab-brand-500 transition-colors font-arabic';

export const Footer: React.FC = () => {
  const { t, isRTL } = useLanguage();
  const [categories, setCategories] = useState<Category[]>([]);
  const [zones, setZones] = useState<DeliveryZone[]>([]);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
    getDeliveryZones().then(setZones).catch(() => {});
  }, []);

  const departments = useMemo(() => featuredCategories(categories, 5), [categories]);

  return (
    <footer className="bg-ragab-ink-800 text-white border-t-4 border-ragab-brand-500 pb-[calc(var(--bottom-nav-h)+1.5rem)] md:pb-8">
      <div className="container-page pt-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-10 pb-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1 space-y-4">
            <RagabLogo theme="dark" size="md" />
            <p className="text-body-sm text-ragab-ink-300 leading-relaxed font-arabic max-w-xs">
              {t.footer.aboutText}
            </p>
            <p className="text-body-sm text-ragab-brand-500 font-bold font-arabic">
              «{t.common.slogan}»
            </p>
          </div>

          {/* Departments */}
          <nav aria-label={t.footer.categories}>
            <h4 className={headingCls}>{t.footer.categories}</h4>
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
          </nav>

          {/* Customer service */}
          <div>
            <h4 className={headingCls}>{t.footer.customerService}</h4>
            <ul className="space-y-2.5 text-body-sm text-ragab-ink-300 font-arabic">
              <li className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-ragab-brand-500 shrink-0" />
                <a dir="ltr" href="tel:+201012345678" className="font-bold text-white hover:text-ragab-brand-500 transition-colors">
                  +20 10 1234 5678
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <MessageSquare className="w-4 h-4 text-ragab-brand-500 shrink-0" />
                <span>
                  {t.common.whatsapp}: <span dir="ltr">01012345678</span>
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-ragab-brand-500 shrink-0 mt-1" />
                <span>{t.footer.workingHours}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-ragab-brand-500 shrink-0 mt-1" />
                <span>{t.common.location}</span>
              </li>
            </ul>
          </div>

          {/* Delivery zones */}
          <div>
            <h4 className={headingCls}>{t.footer.deliveryZones}</h4>
            <ul className="space-y-2 text-body-sm font-arabic">
              {zones.map((z) => (
                <li key={z.id} className="flex items-center justify-between gap-3">
                  <span className="text-ragab-ink-300">{isRTL ? z.nameAr : z.nameEn}</span>
                  <span className="font-bold text-ragab-brand-500 tabular-nums whitespace-nowrap">
                    {z.deliveryFee === 0 ? (isRTL ? 'مجاني' : 'Free') : `${z.deliveryFee} ${t.common.egp}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-6 border-t border-white/10 text-caption text-ragab-ink-400 flex flex-col sm:flex-row items-center justify-between gap-3 font-arabic">
          <div>{t.footer.copyright}</div>
          <div className="flex items-center gap-2">
            <Link href="/privacy" className="hover:text-white transition-colors py-1 inline-block">
              {t.footer.privacy}
            </Link>
            <span>·</span>
            <Link href="/terms" className="hover:text-white transition-colors py-1 inline-block">
              {t.footer.terms}
            </Link>
          </div>
        </div>

        {/* Developer credit */}
        <div className="mt-5 flex justify-center">
          <a
            href="https://ahmed-ismail-portfolio-pied.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-caption text-ragab-ink-300 hover:border-ragab-brand-500 hover:text-white transition-colors focus-ring"
          >
            <Code2 className="w-3.5 h-3.5 text-ragab-brand-500 shrink-0" />
            <span>{isRTL ? 'تم التطوير بواسطة' : 'Developed by'}</span>
            <span dir="ltr" className="font-bold text-ragab-brand-500 underline-offset-4 group-hover:underline">
              Ahmed Ismail
            </span>
          </a>
        </div>
      </div>
    </footer>
  );
};
