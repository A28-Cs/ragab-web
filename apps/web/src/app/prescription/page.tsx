'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  UploadCloud,
  Camera,
  CheckCircle2,
  Clock,
  XCircle,
  ShoppingBag,
  FileText,
  AlertCircle,
  Phone,
  MessageCircle,
  Loader2,
  ExternalLink,
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '@ragab/utils';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { FormField } from '../../components/ui/FormField';
import { StatusPill } from '../../components/ui/StatusPill';
import {
  uploadPrescriptionImage,
  submitPrescription,
  getPrescriptionById,
  addPrescriptionItemsToCart,
  getMyPrescriptions,
} from '../../services/prescriptionService';
import type { Prescription } from '../../types';

export default function PrescriptionPage() {
  const { user } = useAuth();
  const { isRTL } = useLanguage();
  const { showToast } = useToast();
  const { setIsCartOpen, refresh: refreshCart } = useCart();
  const searchParams = useSearchParams();
  const router = useRouter();

  const rxIdParam = searchParams.get('id');

  // View state
  const [activePrescription, setActivePrescription] = useState<Prescription | null>(null);
  const [loadingActive, setLoadingActive] = useState(false);
  const [myList, setMyList] = useState<Prescription[]>([]);

  // Form state
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState(user?.name || '');
  const [customerPhone, setCustomerPhone] = useState(user?.phone || '');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync user info if user logs in
  useEffect(() => {
    if (user?.name && !customerName) setCustomerName(user.name);
    if (user?.phone && !customerPhone) setCustomerPhone(user.phone);
  }, [user]);

  // Load prescription by ID if in query params
  useEffect(() => {
    if (rxIdParam) {
      setLoadingActive(true);
      getPrescriptionById(rxIdParam)
        .then((rx) => setActivePrescription(rx))
        .catch(() => showToast(isRTL ? 'تعذر تحميل بيانات الروشتة' : 'Failed to load prescription', 'error'))
        .finally(() => setLoadingActive(false));
    }
  }, [rxIdParam, isRTL]);

  // Load user's previous prescriptions if signed in
  useEffect(() => {
    if (user?.id) {
      getMyPrescriptions()
        .then(setMyList)
        .catch(() => {});
    }
  }, [user?.id]);

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

    if (!file) {
      showToast(isRTL ? 'يرجى اختيار صورة الروشتة أولاً' : 'Please upload a prescription image', 'error');
      return;
    }
    if (!customerName.trim()) {
      showToast(isRTL ? 'يرجى كتابة الاسم' : 'Please enter your name', 'error');
      return;
    }
    if (!customerPhone.trim()) {
      showToast(isRTL ? 'يرجى كتابة رقم الهاتف' : 'Please enter your phone number', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Upload image
      const uploadedUrl = await uploadPrescriptionImage(file);

      // 2. Submit prescription
      const res = await submitPrescription({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        imageUrl: uploadedUrl,
        notes: notes.trim() || undefined,
      });

      showToast(
        isRTL
          ? 'تم إرسال الروشتة للصيدلي بنجاح! سيتم فحصها فوراً وإضافة الأدوية لسلتك.'
          : 'Prescription sent! Our pharmacist will review it and add medications to your cart.',
        'success'
      );

      // Reset form
      setFile(null);
      setPreviewUrl(null);
      setNotes('');

      // Load active prescription view
      router.push(`/prescription?id=${res.id}`);
    } catch (err: any) {
      showToast(err?.message || (isRTL ? 'حدث خطأ أثناء الإرسال' : 'Failed to submit prescription'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddToCart = async (prescriptionId: string) => {
    setIsAddingToCart(true);
    try {
      await addPrescriptionItemsToCart(prescriptionId);
      await refreshCart();
      setIsCartOpen(true);
      showToast(isRTL ? 'تمت إضافة جميع أدوية الروشتة إلى السلة بنجاح!' : 'Prescription medicines added to your cart!', 'success');
    } catch (err: any) {
      showToast(err?.message || (isRTL ? 'تعذر إضافة الأدوية إلى السلة' : 'Failed to add items to cart'), 'error');
    } finally {
      setIsAddingToCart(false);
    }
  };

  const statusTone = (status: Prescription['status']) => {
    switch (status) {
      case 'reviewed':
        return 'success';
      case 'pending':
        return 'warning';
      case 'completed':
        return 'success';
      case 'rejected':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  const statusLabel = (status: Prescription['status']) => {
    switch (status) {
      case 'reviewed':
        return isRTL ? 'تم تحديد الأدوية وإضافتها للسلة' : 'Medicines Identified & In Cart';
      case 'pending':
        return isRTL ? 'قيد مراجعة الصيدلي' : 'Reviewing by Pharmacist';
      case 'completed':
        return isRTL ? 'تم تنفيذ الطلب' : 'Completed';
      case 'rejected':
        return isRTL ? 'تعذر تنفيذ الروشتة' : 'Cannot fulfill';
      default:
        return status;
    }
  };

  return (
    <div className="container-page py-6 md:py-10 font-arabic max-w-4xl space-y-8">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ragab-brand-600 via-ragab-brand-700 to-ragab-brand-900 text-white p-6 sm:p-8 shadow-card">
        <div className="relative z-10 space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-white text-caption font-bold backdrop-blur-sm">
            <FileText className="w-4 h-4" />
            <span>{isRTL ? 'خدمة الروشتة الذكية · صيدلية رجب' : 'Smart Prescription Service · Ragab Pharmacy'}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {isRTL ? 'اطلب علاجك برفع صورة الروشتة' : 'Order Medicine with your Prescription'}
          </h1>
          <p className="text-body-sm sm:text-base text-ragab-brand-100 leading-relaxed">
            {isRTL
              ? 'صور الروشتة أو عبوة الدواء وارفعها، وسيقوم الطبيب الصيدلي بقراءتها وتحديد كل الأدوية المطلوبة وإضافتها إلى سلتك فوراً لتأكيد طلبك وتوصيله لباب بيتك.'
              : 'Snap and upload your prescription. Our pharmacist will review it, identify all required medicines, and add them directly to your cart.'}
          </p>
        </div>
      </div>

      {/* If viewing a specific prescription */}
      {activePrescription && (
        <div className="bg-white rounded-3xl border border-ragab-ink-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-ragab-ink-100">
            <div>
              <span className="text-caption font-bold text-ragab-brand-700 block">
                {isRTL ? `طلب روشتة رقم #${activePrescription.id}` : `Prescription #${activePrescription.id}`}
              </span>
              <h2 className="text-h2 font-bold text-ragab-ink-900 mt-0.5">
                {activePrescription.customerName}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <StatusPill tone={statusTone(activePrescription.status)}>
                {statusLabel(activePrescription.status)}
              </StatusPill>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActivePrescription(null);
                  router.push('/prescription');
                }}
              >
                {isRTL ? 'رفع روشتة جديدة' : 'Upload New'}
              </Button>
            </div>
          </div>

          {/* Stepper tracker */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className={cn(
              'p-4 rounded-2xl border text-center space-y-1.5 transition-all',
              activePrescription.status !== 'rejected'
                ? 'bg-ragab-brand-50/60 border-ragab-brand-300 text-ragab-brand-900'
                : 'bg-ragab-ink-50 border-ragab-ink-200 text-ragab-ink-500'
            )}>
              <div className="w-8 h-8 rounded-full bg-white text-ragab-brand-600 font-bold flex items-center justify-center mx-auto shadow-xs">
                ✓
              </div>
              <p className="font-bold text-body-sm">{isRTL ? '1. تم استلام الروشتة' : '1. Received'}</p>
              <p className="text-caption text-ragab-ink-500">
                {new Date(activePrescription.createdAt).toLocaleDateString(isRTL ? 'ar-EG' : 'en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>

            <div className={cn(
              'p-4 rounded-2xl border text-center space-y-1.5 transition-all',
              activePrescription.status === 'pending'
                ? 'bg-amber-50 border-amber-300 text-amber-900 ring-2 ring-amber-400/20'
                : activePrescription.status === 'reviewed' || activePrescription.status === 'completed'
                ? 'bg-ragab-brand-50/60 border-ragab-brand-300 text-ragab-brand-900'
                : 'bg-ragab-ink-50 border-ragab-ink-200 text-ragab-ink-500'
            )}>
              <div className="w-8 h-8 rounded-full bg-white text-amber-600 font-bold flex items-center justify-center mx-auto shadow-xs">
                {activePrescription.status === 'pending' ? <Loader2 className="w-4 h-4 animate-spin" /> : '✓'}
              </div>
              <p className="font-bold text-body-sm">{isRTL ? '2. فحص الطبيب الصيدلي' : '2. Pharmacist Review'}</p>
              <p className="text-caption text-ragab-ink-500">
                {activePrescription.status === 'pending'
                  ? (isRTL ? 'جاري الفحص الآن...' : 'In progress...')
                  : (isRTL ? 'تم الفحص وتحديد الأدوية' : 'Completed')}
              </p>
            </div>

            <div className={cn(
              'p-4 rounded-2xl border text-center space-y-1.5 transition-all',
              activePrescription.status === 'reviewed' || activePrescription.status === 'completed'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900 ring-2 ring-emerald-400/20'
                : activePrescription.status === 'rejected'
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-ragab-ink-50 border-ragab-ink-200 text-ragab-ink-400'
            )}>
              <div className="w-8 h-8 rounded-full bg-white text-emerald-600 font-bold flex items-center justify-center mx-auto shadow-xs">
                {activePrescription.status === 'reviewed' || activePrescription.status === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : activePrescription.status === 'rejected' ? (
                  <XCircle className="w-4 h-4 text-red-500" />
                ) : (
                  '3'
                )}
              </div>
              <p className="font-bold text-body-sm">
                {activePrescription.status === 'rejected'
                  ? (isRTL ? 'تعذر التنفيذ' : 'Rejected')
                  : (isRTL ? '3. الإضافة للسلة والطلب' : '3. Ready in Cart')}
              </p>
              <p className="text-caption text-ragab-ink-500">
                {activePrescription.status === 'reviewed'
                  ? (isRTL ? 'الأدوية جاهزة بسلتك' : 'In your cart now')
                  : (isRTL ? 'بانتظار المراجعة' : 'Pending review')}
              </p>
            </div>
          </div>

          {/* Prescription image preview */}
          <div className="space-y-2">
            <h3 className="text-label text-ragab-ink-700 font-bold">{isRTL ? 'صورة الروشتة المرفوعة' : 'Prescription Image'}</h3>
            <div className="relative rounded-2xl border border-ragab-ink-200 overflow-hidden bg-ragab-surface-sunken max-w-md max-h-72 flex items-center justify-center p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activePrescription.imageUrl}
                alt="Prescription"
                className="max-h-64 object-contain rounded-xl hover:scale-105 transition-transform cursor-pointer"
                onClick={() => window.open(activePrescription.imageUrl, '_blank')}
                title={isRTL ? 'انقر لفتح الصورة بحجمها الكامل' : 'Click to enlarge'}
              />
            </div>
            {activePrescription.notes && (
              <p className="text-body-sm text-ragab-ink-600 pt-1">
                <span className="font-bold text-ragab-ink-800">{isRTL ? 'ملاحظاتك: ' : 'Your notes: '}</span>
                {activePrescription.notes}
              </p>
            )}
          </div>

          {/* Pharmacist Review Feedback & Prescribed Items */}
          {activePrescription.status === 'reviewed' && (
            <div className="space-y-4 pt-4 border-t border-ragab-ink-100 animate-in fade-in duration-300">
              <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 space-y-2">
                <div className="flex items-center gap-2 text-emerald-900 font-bold text-body">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>{isRTL ? 'تم تجهيز الأدوية المطلوبة بواسطة الطبيب الصيدلي!' : 'Medications prepared by the pharmacist!'}</span>
                </div>
                {activePrescription.pharmacistNotes && (
                  <div className="p-3 bg-white/80 rounded-xl border border-emerald-100 text-body-sm text-emerald-950">
                    <span className="font-bold block text-caption text-emerald-800">{isRTL ? 'ملاحظات الصيدلي:' : 'Pharmacist Advice:'}</span>
                    {activePrescription.pharmacistNotes}
                  </div>
                )}
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <h3 className="text-h3 font-bold text-ragab-ink-900">
                  {isRTL ? 'الأدوية المحددة في الروشتة' : 'Identified Medications'}
                </h3>
                <div className="divide-y divide-ragab-ink-100 border border-ragab-ink-200 rounded-2xl overflow-hidden bg-white">
                  {activePrescription.items.map((item, idx) => (
                    <div key={idx} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        {item.productImage && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.productImage}
                            alt=""
                            className="w-12 h-12 rounded-xl object-contain border border-ragab-ink-100 bg-white shrink-0 p-1"
                          />
                        )}
                        <div>
                          <p className="font-bold text-ragab-ink-900">{item.productNameAr}</p>
                          {item.instructions && (
                            <p className="text-caption text-ragab-brand-800 font-semibold mt-0.5">
                              {isRTL ? `طريقة الاستخدام: ${item.instructions}` : `Instructions: ${item.instructions}`}
                            </p>
                          )}
                          <p className="text-caption text-ragab-ink-500">
                            {item.quantity} × {item.price.toFixed(2)} {isRTL ? 'ج.م' : 'EGP'}
                          </p>
                        </div>
                      </div>
                      <div className="font-extrabold text-body text-ragab-ink-900">
                        {((item.price || 0) * (item.quantity || 1)).toFixed(2)} {isRTL ? 'ج.م' : 'EGP'}
                      </div>
                    </div>
                  ))}
                  <div className="p-4 bg-ragab-ink-50 flex items-center justify-between font-bold text-body">
                    <span>{isRTL ? 'إجمالي قيمة العلاج' : 'Total'}</span>
                    <span className="text-h3 text-ragab-brand-800">
                      {activePrescription.items
                        .reduce((sum, it) => sum + (it.price || 0) * (it.quantity || 1), 0)
                        .toFixed(2)}{' '}
                      {isRTL ? 'ج.م' : 'EGP'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Call to action */}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1 text-base bg-emerald-600 hover:bg-emerald-700 text-white shadow-card py-6"
                  leftIcon={<ShoppingBag className="w-5 h-5" />}
                  onClick={() => setIsCartOpen(true)}
                >
                  {isRTL ? 'عرض السلة وإتمام الطلب' : 'Open Cart & Checkout'}
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  isLoading={isAddingToCart}
                  onClick={() => handleAddToCart(activePrescription.id)}
                  title={isRTL ? 'إضافة إلى السلة مجدداً' : 'Add to cart again'}
                >
                  {isRTL ? 'إعادة الإضافة للسلة' : 'Re-add to Cart'}
                </Button>
              </div>
            </div>
          )}

          {/* Rejection notice */}
          {activePrescription.status === 'rejected' && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-body">
                <XCircle className="w-5 h-5 text-red-600 shrink-0" />
                <span>{isRTL ? 'تعذر تجهيز الروشتة' : 'Cannot fulfill prescription'}</span>
              </div>
              <p className="text-body-sm text-red-800">
                {activePrescription.rejectionReason || (isRTL ? 'خط الروشتة غير واضح أو الأدوية تتطلب استشارة طبيب متخصص.' : 'Prescription is unclear.')}
              </p>
              <div className="pt-2">
                <a
                  href={`https://wa.me/201015694380?text=${encodeURIComponent(
                    isRTL
                      ? `مرحباً صيدلية رجب، بخصوص طلبي للروشتة #${activePrescription.id}...`
                      : `Hello Ragab Pharmacy, regarding prescription #${activePrescription.id}...`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-caption hover:bg-emerald-700 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{isRTL ? 'مراسلة الصيدلية عبر واتساب للاستفسار' : 'Chat on WhatsApp'}</span>
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Prescription Upload Form */}
      {(!activePrescription || activePrescription.status === 'completed') && (
        <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-ragab-ink-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="space-y-1">
            <h2 className="text-h2 font-bold text-ragab-ink-900">
              {isRTL ? 'رفع روشتة جديدة' : 'Upload New Prescription'}
            </h2>
            <p className="text-body-sm text-ragab-ink-500">
              {isRTL
                ? 'التقط صورة واضحة للروشتة بكاميرا الموبايل أو اختر ملف الصورة من جهازك.'
                : 'Take a clear photo of your prescription or select an image file.'}
            </p>
          </div>

          {/* Upload Area */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-3xl p-6 sm:p-10 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3',
              previewUrl
                ? 'border-emerald-400 bg-emerald-50/20'
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
                <div className="relative max-w-xs mx-auto rounded-2xl overflow-hidden border border-emerald-200 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="Preview" className="max-h-64 object-contain mx-auto" />
                </div>
                <div className="flex items-center justify-center gap-2 text-caption text-emerald-800 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
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
                <div className="w-16 h-16 rounded-2xl bg-ragab-brand-100 text-ragab-brand-700 flex items-center justify-center shadow-xs">
                  <Camera className="w-8 h-8" />
                </div>
                <div>
                  <p className="font-extrabold text-body text-ragab-ink-900">
                    {isRTL ? 'اضغط لالتقاط صورة بكاميرا الهاتف أو اختيار ملف' : 'Click to snap photo or select file'}
                  </p>
                  <p className="text-caption text-ragab-ink-500 mt-1">
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

          {/* Customer Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label={isRTL ? 'الاسم بالكامل' : 'Full Name'}>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={isRTL ? 'أدخل اسمك' : 'Your name'}
                required
              />
            </FormField>

            <FormField label={isRTL ? 'رقم الهاتف (للتواصل وتأكيد الطلب)' : 'Phone Number'}>
              <Input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="010XXXXXXXX"
                dir="ltr"
                required
              />
            </FormField>
          </div>

          <FormField label={isRTL ? 'ملاحظات إضافية للصيدلي (اختياري)' : 'Additional Notes (Optional)'}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={
                isRTL
                  ? 'مثال: محتاج بدائل مصرية أرخص، أو محتاج علبة واحدة فقط، أو اتصل بي قبل التأكيد...'
                  : 'E.g., prefer generic alternatives, need only 1 pack, etc.'
              }
              className="w-full px-4 py-3 rounded-xl border border-ragab-ink-200 focus:border-ragab-brand-500 focus:ring-4 focus:ring-ragab-brand-500/10 focus:outline-none text-body-sm text-ragab-ink-800 placeholder-ragab-ink-400 font-arabic resize-y"
            />
          </FormField>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isSubmitting}
            leftIcon={<UploadCloud className="w-5 h-5" />}
            className="py-5 text-base shadow-card bg-ragab-brand-600 hover:bg-ragab-brand-700 text-white"
          >
            {isRTL ? 'إرسال الروشتة للصيدلي الآن' : 'Send Prescription to Pharmacist'}
          </Button>
        </form>
      )}

      {/* Previous Prescriptions History (if signed in) */}
      {myList.length > 0 && (
        <div className="bg-white rounded-3xl border border-ragab-ink-200 p-6 space-y-4">
          <h3 className="text-h3 font-bold text-ragab-ink-900">
            {isRTL ? 'الروشتات السابقة الخاصة بك' : 'Your Previous Prescriptions'}
          </h3>
          <div className="divide-y divide-ragab-ink-100">
            {myList.map((rx) => (
              <div
                key={rx.id}
                onClick={() => {
                  setActivePrescription(rx);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="py-3 flex items-center justify-between gap-4 cursor-pointer hover:bg-ragab-ink-50/50 rounded-xl px-2 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={rx.imageUrl}
                    alt=""
                    className="w-12 h-12 rounded-xl object-cover border border-ragab-ink-100 shrink-0"
                  />
                  <div>
                    <span className="font-bold text-body-sm text-ragab-ink-900 block">
                      {isRTL ? `روشتة #${rx.id}` : `Prescription #${rx.id}`}
                    </span>
                    <span className="text-caption text-ragab-ink-500">
                      {new Date(rx.createdAt).toLocaleDateString(isRTL ? 'ar-EG' : 'en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill tone={statusTone(rx.status)}>{statusLabel(rx.status)}</StatusPill>
                  <ExternalLink className="w-4 h-4 text-ragab-ink-400" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
