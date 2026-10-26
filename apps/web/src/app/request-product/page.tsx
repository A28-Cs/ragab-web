'use client';

import React, { Suspense, useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  UploadCloud,
  Camera,
  CheckCircle2,
  Trash2,
  PackageSearch,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Phone,
  MessageCircle,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@ragab/utils';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { FormField } from '../../components/ui/FormField';
import {
  uploadProductRequestImage,
  submitProductRequest,
} from '../../services/productService';

function RequestProductContent() {
  const { user } = useAuth();
  const { isRTL } = useLanguage();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const initialName = searchParams.get('name') || '';

  const [productName, setProductName] = useState(initialName);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState(user?.name || '');
  const [customerPhone, setCustomerPhone] = useState(user?.phone || '');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const DirectionArrow = isRTL ? ArrowLeft : ArrowRight;

  useEffect(() => {
    if (user?.name && !customerName) setCustomerName(user.name);
    if (user?.phone && !customerPhone) setCustomerPhone(user.phone);
  }, [user]);

  useEffect(() => {
    if (initialName && !productName) setProductName(initialName);
  }, [initialName]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setPreviewUrl(URL.createObjectURL(selected));
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selected = e.dataTransfer.files[0];
      setFile(selected);
      setPreviewUrl(URL.createObjectURL(selected));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!productName.trim()) {
      showToast(isRTL ? 'يرجى كتابة اسم الدواء أو المنتج المطلوب' : 'Please enter the product name', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      let uploadedUrl: string | undefined;
      if (file) {
        uploadedUrl = await uploadProductRequestImage(file);
      }

      const res = await submitProductRequest({
        productName: productName.trim(),
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        imageUrl: uploadedUrl,
        notes: notes.trim() || undefined,
      });

      setSubmittedId(res.id);
      showToast(
        isRTL
          ? 'تم إرسال طلب التوفير لمسؤولي الصيدلية بنجاح!'
          : 'Your product procurement request has been submitted!',
        'success'
      );
    } catch (err: any) {
      showToast(err?.message || (isRTL ? 'حدث خطأ أثناء الإرسال' : 'Failed to submit request'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setProductName('');
    setFile(null);
    setPreviewUrl(null);
    setNotes('');
    setSubmittedId(null);
  };

  return (
    <div className="container-page py-6 md:py-10 font-arabic max-w-3xl space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-ragab-brand-200 bg-[#edf7f5] p-6 sm:p-8">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ragab-brand-100 text-ragab-brand-800 text-caption font-bold">
            <PackageSearch className="w-4 h-4 text-ragab-brand-700" />
            <span>{isRTL ? 'خدمة توفير الأدوية والمنتجات الطبية' : 'Product Procurement Service'}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ragab-ink-900 tracking-tight">
            {isRTL ? 'طلب توفير دواء أو منتج طبي غير متوفر' : 'Request an Unavailable Product'}
          </h1>
          <p className="text-body-sm sm:text-base text-ragab-ink-600 leading-relaxed">
            {isRTL
              ? 'بتدور على دواء أو مستلزم طبي ومش لاقيه في المتجر؟ اكتب اسمه وارفع صورته ودكتور الصيدلية هيوفرهولك ويتواصل معاك فور توفره!'
              : 'Looking for a medicine or medical product not found in our catalog? Provide its name and photo, and our team will source it for you.'}
          </p>
        </div>
      </div>

      {submittedId ? (
        /* Success State */
        <div className="bg-white rounded-3xl border border-ragab-ink-200 shadow-sm p-6 sm:p-10 text-center space-y-6 animate-in fade-in duration-300">
          <div className="w-16 h-16 rounded-2xl bg-ragab-brand-100 text-ragab-brand-700 flex items-center justify-center mx-auto shadow-xs">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="space-y-2 max-w-lg mx-auto">
            <span className="text-caption font-bold text-ragab-brand-700 block">
              {isRTL ? `طلب توفير رقم #${submittedId}` : `Request #${submittedId}`}
            </span>
            <h2 className="text-2xl font-extrabold text-ragab-ink-900">
              {isRTL ? 'تم استلام طلب التوفير بنجاح!' : 'Request Received Successfully!'}
            </h2>
            <p className="text-body-sm text-ragab-ink-600 leading-relaxed">
              {isRTL
                ? `طلبك لتوفير "${productName}" قيد المراجعة الآن لدى مسؤولي الصيدلية. سنتواصل معك فور توفره لتأكيد إرساله لباب بيتك.`
                : `Your request for "${productName}" is now being reviewed by pharmacy staff. We will reach out once available.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            <Button variant="primary" size="lg" onClick={handleReset} className="bg-ragab-brand-700 hover:bg-ragab-brand-800 text-white">
              {isRTL ? 'طلب منتج آخر' : 'Request Another Product'}
            </Button>
            <Link href="/" className="inline-flex items-center justify-center gap-2 min-h-12 px-6 rounded-xl border border-ragab-ink-200 hover:bg-ragab-ink-50 text-ragab-ink-800 font-bold text-body-sm transition-colors">
              <span>{isRTL ? 'العودة للصفحة الرئيسية' : 'Back to Home'}</span>
              <DirectionArrow className="w-4 h-4" />
            </Link>
          </div>
        </div>
      ) : (
        /* Request Form */
        <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-ragab-ink-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="space-y-1">
            <h2 className="text-h2 font-bold text-ragab-ink-900">
              {isRTL ? 'بيانات المنتج المطلوب' : 'Requested Product Details'}
            </h2>
            <p className="text-body-sm text-ragab-ink-500">
              {isRTL
                ? 'يرجى كتابة اسم المنتج بدقة وإرفاق صورته إن وُجدت لتسهيل البحث عنه وتوفيره.'
                : 'Please provide the product name and photo to help us identify and procure it quickly.'}
            </p>
          </div>

          {/* Product Name */}
          <FormField label={isRTL ? 'اسم الدواء أو المنتج الطبي' : 'Product / Medicine Name'} required>
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder={
                isRTL
                  ? 'مثال: كونكور 5 مجم، أوجمنتين 1 جم، جهاز قياس ضغط...'
                  : 'E.g., Concor 5mg, Augmentin 1g, Blood Pressure Monitor...'
              }
              required
              className="text-base"
            />
          </FormField>

          {/* Image Upload Area */}
          <div className="space-y-2">
            <label className="text-label text-ragab-ink-700 font-bold block">
              {isRTL ? 'صورة المنتج أو العبوة (اختياري / يُفضل إرفاقها)' : 'Product Photo (Optional / Recommended)'}
            </label>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-3xl p-6 sm:p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3',
                previewUrl
                  ? 'border-ragab-brand-400 bg-ragab-brand-50/30'
                  : 'border-ragab-brand-300 hover:border-ragab-brand-500 bg-ragab-brand-50/30 hover:bg-ragab-brand-50/60'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />

              {previewUrl ? (
                <div className="space-y-3">
                  <div className="relative max-w-xs mx-auto rounded-2xl overflow-hidden border border-ragab-brand-200 shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="Preview" className="max-h-56 object-contain mx-auto" />
                  </div>
                  <div className="flex items-center justify-center gap-2 text-caption text-ragab-brand-800 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-ragab-brand-700" />
                    <span>{file?.name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                        setPreviewUrl(null);
                      }}
                      className="p-1 rounded-full hover:bg-red-100 text-red-600 transition-colors ms-1"
                      title={isRTL ? 'حذف الصورة' : 'Remove'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-2xl bg-ragab-brand-100 text-ragab-brand-700 flex items-center justify-center shadow-xs">
                    <Camera className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="font-extrabold text-body-sm sm:text-body text-ragab-ink-900">
                      {isRTL ? 'اضغط لالتقاط صورة للعبوة أو اختيار ملف' : 'Click to take a photo or upload an image'}
                    </p>
                    <p className="text-caption text-ragab-ink-500 mt-0.5">
                      {isRTL ? 'يدعم الصور بصيغة JPG أو PNG أو WebP بحد أقصى 5 ميجابايت' : 'JPG, PNG, or WebP up to 5 MB'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    leftIcon={<UploadCloud className="w-4 h-4" />}
                    className="pointer-events-none mt-1"
                  >
                    {isRTL ? 'تحديد الصورة' : 'Select Image'}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Instructions / Notes */}
          <FormField label={isRTL ? 'تعليمات وملاحظات للطلب (اختياري)' : 'Instructions & Notes (Optional)'}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={
                isRTL
                  ? 'مثال: محتاج علبتين، أو تركيز محدد، أو شركة معينة، أو اتصل بي للتأكيد قبل التوفير...'
                  : 'E.g., need 2 packs, specific dosage, call before confirming...'
              }
              className="w-full px-4 py-3 rounded-xl border border-ragab-ink-200 focus:border-ragab-brand-500 focus:ring-4 focus:ring-ragab-brand-500/10 focus:outline-none text-body-sm text-ragab-ink-800 placeholder-ragab-ink-400 font-arabic resize-y"
            />
          </FormField>

          {/* Contact Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-ragab-ink-100">
            <FormField label={isRTL ? 'رقم الهاتف (للتواصل عند توفيره)' : 'Phone Number (For notification)'}>
              <Input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="010XXXXXXXX"
                dir="ltr"
              />
            </FormField>

            <FormField label={isRTL ? 'الاسم (اختياري)' : 'Full Name (Optional)'}>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={isRTL ? 'اسمك الكريم' : 'Your name'}
              />
            </FormField>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isSubmitting}
            leftIcon={<PackageSearch className="w-5 h-5" />}
            className="py-5 text-base shadow-card bg-ragab-brand-700 hover:bg-ragab-brand-800 text-white"
          >
            {isRTL ? 'إرسال طلب التوفير للصيدلية' : 'Submit Procurement Request'}
          </Button>
        </form>
      )}
    </div>
  );
}

export default function RequestProductPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center font-arabic">...</div>}>
      <RequestProductContent />
    </Suspense>
  );
}
