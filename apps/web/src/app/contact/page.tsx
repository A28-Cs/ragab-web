'use client';

import React, { useState } from 'react';
import { Phone, MapPin, MessageSquare, Clock, Send, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { Button } from '../../components/ui/Button';

export default function ContactPage() {
  const { t } = useLanguage();
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16 font-arabic">
      <div className="bg-white rounded-2xl border border-gray-200/80 p-8 shadow-card space-y-3 text-center">
        <h1 className="text-3xl font-extrabold text-ragab-charcoal">تواصل مع صيدلية رجب</h1>
        <p className="text-sm text-gray-500 max-w-xl mx-auto">
          نحن دائمًا في خدمتكم بقرية عليم. تسعدنا استفساراتكم واقتراحاتكم لتطوير الخدمة.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Contact Info */}
        <div className="md:col-span-5 bg-white rounded-xl border border-gray-200/80 p-6 shadow-subtle space-y-6">
          <h3 className="text-lg font-bold text-ragab-charcoal pb-2 border-b border-gray-100">
            معلومات الاتصال بالفرع
          </h3>

          <div className="space-y-4 text-xs text-gray-700">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block text-ragab-charcoal font-bold text-sm mb-0.5">العنوان:</strong>
                <span>قرية عليم – مركز أبو حماد – محافظة الشرقية – مصر</span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Phone className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block text-ragab-charcoal font-bold text-sm mb-0.5">الهاتف المباشر:</strong>
                <span dir="ltr" className="font-mono font-bold">+20 10 1234 5678</span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MessageSquare className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block text-ragab-charcoal font-bold text-sm mb-0.5">واتساب المتجر:</strong>
                <span dir="ltr" className="font-mono font-bold">+20 10 1234 5678</span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block text-ragab-charcoal font-bold text-sm mb-0.5">ساعات العمل:</strong>
                <span>يومياً من 8 صباحاً حتى 12 منتصف الليل</span>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="md:col-span-7 bg-white rounded-xl border border-gray-200/80 p-6 shadow-subtle space-y-4">
          <h3 className="text-lg font-bold text-ragab-charcoal pb-2 border-b border-gray-100">
            أرسل لنا رسالة أو ملاحظة
          </h3>

          {submitted ? (
            <div className="p-6 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <h4 className="font-bold text-base">تم استلام رسالتك بنجاح!</h4>
              <p className="text-xs">شكراً لتواصلك معنا. سيقوم أحد أفراد طاقم رجب بالرد عليك قريباً.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-xs font-arabic">
              <div>
                <label className="font-bold text-gray-700 block mb-1">الاسم بالكامل *</label>
                <input
                  type="text"
                  required
                  placeholder="أحمد محمود"
                  className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-lg font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">رقم المحمول *</label>
                <input
                  type="tel"
                  required
                  placeholder="01012345678"
                  className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-lg font-bold font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">نص الرسالة أو الاستفسار *</label>
                <textarea
                  rows={4}
                  required
                  placeholder="اكتب ملاحظتك هنا..."
                  className="w-full p-3 bg-gray-50 border border-gray-300 rounded-lg"
                />
              </div>

              <Button type="submit" variant="primary" fullWidth size="lg">
                <Send className="w-4 h-4" />
                <span>إرسال الرسالة</span>
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
