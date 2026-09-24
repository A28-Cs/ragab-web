'use client';

import React from 'react';
import { FileText } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export default function TermsPage() {
  const { t } = useLanguage();

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16 font-arabic bg-white p-8 rounded-2xl border border-gray-200/80 shadow-subtle">
      <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
        <FileText className="w-8 h-8 text-amber-600" />
        <div>
          <h1 className="text-2xl font-bold text-ragab-charcoal">{t.footer.terms}</h1>
          <p className="text-xs text-gray-500">صيدلية رجب — قرية عليم</p>
        </div>
      </div>

      <div className="space-y-4 text-xs text-gray-700 leading-relaxed">
        <h3 className="text-sm font-bold text-ragab-charcoal">1. شروط الطلب والتوصيل</h3>
        <p>
          يقدم صيدلية رجب خدمة التوصيل لقرية عليم والقرى المجاورة بمركز أبو حماد. يتم استلام الطلبات وتحضيرها من مخزن المحل مباشرة.
        </p>

        <h3 className="text-sm font-bold text-ragab-charcoal">2. أسعار السلع والمنتجات</h3>
        <p>
          جميع الأسعار المعلنة على الموقع هي الأسعار المعتمدة يومياً في المتجر. نلتزم بالأمانة التامة والشفافية.
        </p>

        <h3 className="text-sm font-bold text-ragab-charcoal">3. الإرجاع والاستبدال</h3>
        <p>
          يحق للعميل التأكد من جودة المنتجات والسلع عند استلامها من مندوب التوصيل وإرجاع أي منتج غير مطابق للمواصفات فوراً.
        </p>
      </div>
    </div>
  );
}
