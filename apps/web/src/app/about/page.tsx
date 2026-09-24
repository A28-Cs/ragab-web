'use client';

import React from 'react';
import { Store, ShieldCheck, MapPin, Phone, Award, Users } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { RagabLogo } from '../../components/ui/RagabLogo';

export default function AboutPage() {
  const { t } = useLanguage();

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16 font-arabic">
      <div className="bg-white rounded-2xl border border-gray-200/80 p-8 shadow-card text-center space-y-4">
        <RagabLogo size="lg" className="justify-center" />
        <h1 className="text-3xl font-extrabold text-ragab-charcoal">
          عن صيدلية رجب
        </h1>
        <p className="text-base text-gray-600 max-w-2xl mx-auto leading-relaxed">
          صيدلية رجب في قرية عليم – مركز أبو حماد – محافظة الشرقية. رحلة بدأت من قلب القرية لتقديم أفضل المنتجات الغذائية والسلع الاستهلاكية بأسعار عادلة ورجبة بالمليم.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200/80 space-y-2 text-center shadow-subtle">
          <div className="w-12 h-12 rounded-full bg-ragab-cream text-ragab-charcoal flex items-center justify-center mx-auto mb-2">
            <Store className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-ragab-charcoal">خدمة أهل البلد</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            نحن جزء من نسيج قرية عليم ونعتز بتقديم خدماتنا لجميع العائلات والمنازل في القرية والقرى المجاورة.
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200/80 space-y-2 text-center shadow-subtle">
          <div className="w-12 h-12 rounded-full bg-ragab-cream text-ragab-charcoal flex items-center justify-center mx-auto mb-2">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-ragab-charcoal">كل حاجة بحسابها المظبوط</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            شعارنا هو الثقة والشفافية. نوفر منتجات طازجة وأصلية بأقل هامش ربح لضمان أنسب سعر يومياً.
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200/80 space-y-2 text-center shadow-subtle">
          <div className="w-12 h-12 rounded-full bg-ragab-cream text-ragab-charcoal flex items-center justify-center mx-auto mb-2">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-ragab-charcoal">التوصيل الرقمي</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            توسيع تجربة المتجر أونلاين لتسهيل طلب الاحتياجات اليومية وتوصيلها مباشرة لباب البيت.
          </p>
        </div>
      </div>
    </div>
  );
}
