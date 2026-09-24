'use client';

import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export default function PrivacyPage() {
  const { t } = useLanguage();

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16 font-arabic bg-white p-8 rounded-2xl border border-gray-200/80 shadow-subtle">
      <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
        <ShieldCheck className="w-8 h-8 text-amber-600" />
        <div>
          <h1 className="text-2xl font-bold text-ragab-charcoal">{t.footer.privacy}</h1>
          <p className="text-xs text-gray-500">صيدلية رجب — قرية عليم</p>
        </div>
      </div>

      <div className="space-y-4 text-xs text-gray-700 leading-relaxed">
        <h3 className="text-sm font-bold text-ragab-charcoal">1. حماية البيانات الشخصية</h3>
        <p>
          نلتزم في صيدلية رجب بحماية خصوصية جميع أهالي القرية والعملاء المستخدمين للموقع أو التقييمات. لا نطلب إلا البيانات الضرورية لتوصيل طلباتكم (الاسم، رقم الهاتف، العنوان بالتفصيل).
        </p>

        <h3 className="text-sm font-bold text-ragab-charcoal">2. استخدام البيانات</h3>
        <p>
          تُستخدم بياناتك فقط لأغراض تحضير الطلب، التواصل عند التوصيل مع سائق الدليفري، وإرسال تحديثات العروض الخاصة بالمتجر في حال موافقتك.
        </p>

        <h3 className="text-sm font-bold text-ragab-charcoal">3. عدم المشاركة مع طرف ثالث</h3>
        <p>
          لا نقوم ببيع أو مشاركة بيانات عملائنا مع أي جهة خارجية إطلاقاً.
        </p>
      </div>
    </div>
  );
}
