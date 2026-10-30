'use client';

import React, { useState } from 'react';
import {
  Phone,
  MapPin,
  MessageSquare,
  Clock,
  Send,
  CheckCircle2,
  UserCheck,
  AlertCircle,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';

export default function ContactPage() {
  const { isRTL } = useLanguage();
  const { user, isLoggedIn } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState('general');
  const [orderNumber, setOrderNumber] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/v1/support/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: isLoggedIn ? (user?.name || name) : name,
          phone: isLoggedIn ? (user?.phone || phone) : phone,
          email: user?.email,
          category,
          orderNumber: orderNumber.trim() || undefined,
          message: message.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'تعذر إرسال الرسالة. يرجى المحاولة لاحقاً.');
      }

      setSubmitted(true);
      setMessage('');
      setOrderNumber('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  const whatsappMessage = encodeURIComponent(
    isLoggedIn && user
      ? `مرحباً صيدلية رجب، أنا العميل ${user.name} (هاتف: ${user.phone}). لدي استفسار:`
      : 'مرحباً صيدلية رجب، أود الاستفسار بخصوص:'
  );

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16 font-arabic">
      <div className="bg-white rounded-2xl border border-gray-200/80 p-8 shadow-card space-y-3 text-center">
        <h1 className="text-3xl font-extrabold text-ragab-charcoal">الدعم والمساعدة - صيدلية رجب</h1>
        <p className="text-sm text-gray-500 max-w-xl mx-auto">
          نحن دائماً في خدمتكم بقرية عليم والقرى المجاورة. تسعدنا استفساراتكم وشكاواكم واقتراحاتكم وسنرد عليكم بأسرع وقت.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Contact Info */}
        <div className="md:col-span-5 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200/80 p-6 shadow-subtle space-y-6">
            <h3 className="text-lg font-bold text-ragab-charcoal pb-2 border-b border-gray-100 flex items-center gap-2">
              <Phone className="w-5 h-5 text-ragab-brand-600" />
              <span>معلومات الاتصال المباشر</span>
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
                  <a
                    href="tel:+201012345678"
                    dir="ltr"
                    className="font-mono font-bold text-ragab-brand-700 hover:underline block"
                  >
                    +20 10 1234 5678
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MessageSquare className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-ragab-charcoal font-bold text-sm mb-0.5">واتساب الصيدلية:</strong>
                  <a
                    href={`https://wa.me/201012345678?text=${whatsappMessage}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono font-bold text-emerald-600 hover:text-emerald-700 hover:underline mt-0.5"
                  >
                    <span>+20 10 1234 5678</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
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

          {/* Quick WhatsApp Action Card */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-emerald-900 space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm">
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              <span>محادثة فورية عبر واتساب</span>
            </div>
            <p className="text-xs text-emerald-800 leading-relaxed">
              إذا كنت بحاجة إلى استشارة صيدلانية عاجلة أو متابعة فورية لطلبك، يمكنك التحدث مباشرة مع صيدلي المناوبة.
            </p>
            <a
              href={`https://wa.me/201012345678?text=${whatsappMessage}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors shadow-sm"
            >
              <MessageSquare className="w-4 h-4" />
              <span>فتح محادثة واتساب الآن</span>
            </a>
          </div>
        </div>

        {/* Support Form */}
        <div className="md:col-span-7 bg-white rounded-xl border border-gray-200/80 p-6 shadow-subtle space-y-4">
          <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold text-ragab-charcoal">
              إرسال رسالة أو شكوى للدعم
            </h3>
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>خدمة العملاء</span>
            </span>
          </div>

          {submitted ? (
            <div className="p-8 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <h4 className="font-bold text-lg">تم استلام رسالتك بنجاح!</h4>
              <p className="text-xs leading-relaxed max-w-md mx-auto text-emerald-700">
                شكراً لتواصلك معنا. تم تحويل استفسارك إلى فريق خدمة عملاء صيدلية رجب، وسيتواصل معك أحد الصيادلة أو موظفي الدعم قريباً عبر الهاتف أو الواتساب.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSubmitted(false)}
                className="mt-4"
              >
                إرسال رسالة أخرى
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-xs font-arabic">
              {error && (
                <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg flex items-center gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Verified logged-in user badge */}
              {isLoggedIn && user ? (
                <div className="p-4 bg-ragab-brand-50 border border-ragab-brand-200 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-2 text-ragab-brand-800 font-bold text-sm">
                    <UserCheck className="w-4 h-4 text-ragab-brand-600" />
                    <span>تم ربط بيانات حسابك تلقائياً</span>
                  </div>
                  <p className="text-xs text-ragab-ink-700">
                    المرسل: <strong className="text-ragab-charcoal">{user.name}</strong> • رقم الهاتف: <span dir="ltr" className="font-mono font-bold text-ragab-charcoal">{user.phone}</span>
                    {user.email && <span> • البريد: {user.email}</span>}
                  </p>
                  <p className="text-[11px] text-ragab-ink-500">
                    لا حاجة لإعادة كتابة اسمك أو رقم هاتفك؛ سيصلان للدعم مباشرة مع رسالتك.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">الاسم بالكامل *</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="أحمد محمود"
                      className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-lg font-bold focus:border-ragab-brand-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-gray-700 block mb-1">رقم المحمول *</label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="01012345678"
                      className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-lg font-bold font-mono focus:border-ragab-brand-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-gray-700 block mb-1">نوع الاستفسار / الشكوى</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-lg font-bold focus:border-ragab-brand-500 focus:outline-none"
                  >
                    <option value="general">استفسار عام</option>
                    <option value="order">متابعة أو مشكلة في طلب</option>
                    <option value="delivery">شكوى بخصوص التوصيل أو المندوب</option>
                    <option value="prescription">استفسار عن روشتة أو دواء</option>
                    <option value="complaint">شكوى أو اقتراح تحسين</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-gray-700 block mb-1">رقم الطلب (اختياري)</label>
                  <input
                    type="text"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="مثال: MHS-VG50464Z"
                    className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-lg font-bold font-mono focus:border-ragab-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">
                  نص الرسالة أو الشكوى بالتفصيل *
                </label>
                <textarea
                  rows={4}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="اكتب ملاحظتك أو استفسارك هنا..."
                  className="w-full p-3 bg-gray-50 border border-gray-300 rounded-lg focus:border-ragab-brand-500 focus:outline-none"
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                fullWidth
                size="lg"
                disabled={loading || !message.trim()}
              >
                <Send className="w-4 h-4" />
                <span>{loading ? 'جاري الإرسال...' : 'إرسال الرسالة إلى الدعم'}</span>
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
