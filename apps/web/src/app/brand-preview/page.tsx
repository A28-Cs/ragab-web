'use client';

import React from 'react';
import { RagabLogo, RAGAB_BRAND_COLORS, RAGAB_BRAND_TYPOGRAPHY } from '@ragab/brand';
import { Button, Badge, Price, SectionHeader } from '@ragab/ui';
import { RAGAB_BUSINESS_CONFIG } from '@ragab/config';

export default function BrandPreviewPage() {
  return (
    <div className="min-h-screen bg-ragab-bg p-6 md:p-12 font-arabic" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Header */}
        <div className="bg-white rounded-2xl p-8 shadow-card border border-ragab-border">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <Badge variant="yellow" className="mb-2">دليل الهوية البصرية والمعايير</Badge>
              <h1 className="text-3xl font-extrabold text-ragab-charcoal">
                هوية صيدلية رجب — Brand Identity Guidelines
              </h1>
              <p className="text-ragab-muted mt-1">
                {RAGAB_BUSINESS_CONFIG.sloganAr} ({RAGAB_BUSINESS_CONFIG.locationAr})
              </p>
            </div>
            <RagabLogo variant="bilingual" size="lg" showTagline={true} />
          </div>
        </div>

        {/* Section 1: Logo Variants */}
        <div className="bg-white rounded-2xl p-8 shadow-card border border-ragab-border space-y-6">
          <SectionHeader title="1. نظام شعار رجب (Logo System — 11 Variants)" subtitle="جميع إصدارات الشعار المعتمدة للويب والتطبيق والمطبوعات" />
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-ragab-bg rounded-xl border border-ragab-border flex flex-col items-center justify-center space-y-3">
              <span className="text-xs font-semibold text-ragab-muted">1. Horizontal (الأفقي الأساسي)</span>
              <RagabLogo variant="horizontal" size="md" />
            </div>

            <div className="p-6 bg-ragab-bg rounded-xl border border-ragab-border flex flex-col items-center justify-center space-y-3">
              <span className="text-xs font-semibold text-ragab-muted">2. Bilingual Lockup (عربي + إنجليزي)</span>
              <RagabLogo variant="bilingual" size="md" />
            </div>

            <div className="p-6 bg-ragab-bg rounded-xl border border-ragab-border flex flex-col items-center justify-center space-y-3">
              <span className="text-xs font-semibold text-ragab-muted">3. Stacked (الرأسي)</span>
              <RagabLogo variant="stacked" size="lg" />
            </div>

            <div className="p-6 bg-ragab-bg rounded-xl border border-ragab-border flex flex-col items-center justify-center space-y-3">
              <span className="text-xs font-semibold text-ragab-muted">4. Compact Mark (رمز السلة الصح)</span>
              <RagabLogo variant="mark" size="lg" />
            </div>

            <div className="p-6 bg-ragab-bg rounded-xl border border-ragab-border flex flex-col items-center justify-center space-y-3">
              <span className="text-xs font-semibold text-ragab-muted">5. Arabic Wordmark Only</span>
              <RagabLogo variant="wordmark_ar" size="lg" />
            </div>

            <div className="p-6 bg-ragab-bg rounded-xl border border-ragab-border flex flex-col items-center justify-center space-y-3">
              <span className="text-xs font-semibold text-ragab-muted">6. English Wordmark Only</span>
              <RagabLogo variant="wordmark_en" size="md" />
            </div>

            <div className="p-6 bg-ragab-charcoal rounded-xl text-white flex flex-col items-center justify-center space-y-3">
              <span className="text-xs font-semibold text-gray-400">7. Dark Background Mode</span>
              <RagabLogo variant="dark" size="md" />
            </div>

            <div className="p-6 bg-ragab-charcoal rounded-xl text-white flex flex-col items-center justify-center space-y-3">
              <span className="text-xs font-semibold text-gray-400">8. Monochrome White</span>
              <RagabLogo variant="mono_light" size="md" />
            </div>

            <div className="p-6 bg-white rounded-xl border border-gray-300 flex flex-col items-center justify-center space-y-3">
              <span className="text-xs font-semibold text-ragab-muted">9. Monochrome Black</span>
              <RagabLogo variant="mono_dark" size="md" />
            </div>
          </div>
        </div>

        {/* Section 2: Color Palette */}
        <div className="bg-white rounded-2xl p-8 shadow-card border border-ragab-border space-y-6">
          <SectionHeader title="2. لوحة الألوان الرسمية (Brand Colors)" subtitle="Concept 1 Palette — ألوان رجب المعتمدة" />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <div className="h-24 rounded-xl shadow-inner border border-black/10" style={{ backgroundColor: RAGAB_BRAND_COLORS.yellow }} />
              <p className="font-bold text-sm">Ragab Yellow</p>
              <p className="text-xs text-ragab-muted font-mono">{RAGAB_BRAND_COLORS.yellow}</p>
            </div>

            <div className="space-y-2">
              <div className="h-24 rounded-xl shadow-inner border border-black/10" style={{ backgroundColor: RAGAB_BRAND_COLORS.yellowSecondary }} />
              <p className="font-bold text-sm">Secondary Yellow</p>
              <p className="text-xs text-ragab-muted font-mono">{RAGAB_BRAND_COLORS.yellowSecondary}</p>
            </div>

            <div className="space-y-2">
              <div className="h-24 rounded-xl shadow-inner border border-black/10" style={{ backgroundColor: RAGAB_BRAND_COLORS.cream }} />
              <p className="font-bold text-sm">Warm Cream</p>
              <p className="text-xs text-ragab-muted font-mono">{RAGAB_BRAND_COLORS.cream}</p>
            </div>

            <div className="space-y-2">
              <div className="h-24 rounded-xl shadow-inner border border-black/10" style={{ backgroundColor: RAGAB_BRAND_COLORS.charcoal }} />
              <p className="font-bold text-sm">Charcoal Text</p>
              <p className="text-xs text-ragab-muted font-mono">{RAGAB_BRAND_COLORS.charcoal}</p>
            </div>
          </div>
        </div>

        {/* Section 3: UI Primitives */}
        <div className="bg-white rounded-2xl p-8 shadow-card border border-ragab-border space-y-6">
          <SectionHeader title="3. مكونات واجهة المستخدم (UI Components)" subtitle="المكونات البرمجية من حزمة @ragab/ui" />

          <div className="flex flex-wrap gap-4 items-center">
            <Button variant="primary">زر أساسي</Button>
            <Button variant="secondary">زر ثانوي</Button>
            <Button variant="outline">زر حد خارجي</Button>
            <Badge variant="yellow">خصم 20%</Badge>
            <Badge variant="red">عروض التوفير</Badge>
            <Price amount={115.00} oldAmount={130.00} />
          </div>
        </div>
      </div>
    </div>
  );
}
