'use client';

import React, { useEffect, useState } from 'react';
import { Send, Check, Phone, User as UserIcon, FileText, BellRing, PackageX } from 'lucide-react';
import { Product } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../ui/Toast';
import { submitProductRequest } from '../../services/productService';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { FormField } from '../ui/FormField';

interface RequestProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  variantId?: string;
  variantName?: string;
}

export const RequestProductModal: React.FC<RequestProductModalProps> = ({
  isOpen,
  onClose,
  product,
  variantId,
  variantName,
}) => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState('');
  const [phoneError, setPhoneError] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (user) {
        setName(user.name || '');
        setPhone(user.phone || '');
      } else {
        setName('');
        setPhone('');
      }
      setNotes('');
      setNameError('');
      setPhoneError('');
    }
  }, [isOpen, user]);

  if (!product) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let valid = true;

    if (!name.trim()) {
      setNameError(ar ? 'يرجى إدخال اسمك' : 'Please enter your name');
      valid = false;
    } else {
      setNameError('');
    }

    if (!phone.trim() || phone.trim().length < 8) {
      setPhoneError(ar ? 'يرجى إدخال رقم هاتف صحيح' : 'Please enter a valid phone number');
      valid = false;
    } else {
      setPhoneError('');
    }

    if (!valid) return;

    setLoading(true);
    try {
      await submitProductRequest({
        productId: product.id,
        variantId: variantId || undefined,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        notes: notes.trim() || undefined,
      });

      showToast(
        ar
          ? 'تم إرسال طلبك بنجاح! سيتم إخطار إدارة الصيدلية والتواصل معك فور توفير المنتج.'
          : 'Request sent successfully! Our pharmacy team will contact you once available.',
        'success',
      );
      onClose();
    } catch (err: any) {
      showToast(err?.message || (ar ? 'حدث خطأ أثناء إرسال الطلب' : 'Failed to send request'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={ar ? 'طلب توفير منتج غير متوفر' : 'Request Unavailable Product'}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 font-arabic">
        {/* Product preview */}
        <div className="flex items-center gap-3 p-3 bg-ragab-cream rounded-xl border border-ragab-brand-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.image}
            alt=""
            className="w-14 h-14 rounded-lg object-cover border border-ragab-ink-100 shrink-0 bg-white"
          />
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-ragab-ink-800 text-body truncate">
              {ar ? product.nameAr : product.nameEn || product.nameAr}
            </h4>
            {variantName && (
              <p className="text-caption font-bold text-ragab-brand-700 mt-0.5">
                {variantName}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                <PackageX className="w-3 h-3" />
                {ar ? 'غير متوفر حالياً' : 'Out of stock'}
              </span>
              <span className="text-caption text-ragab-ink-500 font-bold">
                {product.price} {ar ? 'ج.م' : 'EGP'}
              </span>
            </div>
          </div>
        </div>

        <p className="text-body-sm text-ragab-ink-600 leading-relaxed">
          {ar
            ? 'سجل بياناتك وسيصل إشعار فوري لمسؤولي الصيدلية لتوفير هذا المنتج والتواصل معك في أقرب وقت ممكن.'
            : 'Fill in your details and our team will be notified immediately to procure this product and contact you.'}
        </p>

        {/* Customer Name */}
        <FormField label={ar ? 'اسم العميل' : 'Your Name'} error={nameError} required>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError('');
            }}
            placeholder={ar ? 'مثال: أحمد محمد' : 'e.g. Ahmed Mohamed'}
            startIcon={<UserIcon className="w-4 h-4" />}
          />
        </FormField>

        {/* Customer Phone */}
        <FormField label={ar ? 'رقم الهاتف (للتواصل واتساب أو اتصال)' : 'Phone Number'} error={phoneError} required>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (phoneError) setPhoneError('');
            }}
            placeholder={ar ? 'مثال: 01012345678' : 'e.g. 01012345678'}
            startIcon={<Phone className="w-4 h-4" />}
          />
        </FormField>

        {/* Notes */}
        <FormField label={ar ? 'ملاحظات إضافية أو الكمية المطلوبة (اختياري)' : 'Notes or requested quantity (optional)'}>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={ar ? 'مثال: محتاج علبتين ضروري' : 'e.g. Need 2 packs urgently'}
            startIcon={<FileText className="w-4 h-4" />}
          />
        </FormField>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            {ar ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={loading}
            leftIcon={<Send className="w-4 h-4" />}
          >
            {ar ? 'إرسال طلب التوفير' : 'Submit Request'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
