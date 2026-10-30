'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Headphones,
  Phone,
  MessageCircle,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  RotateCcw,
  User,
  Receipt,
  FileEdit,
} from 'lucide-react';
import { RequirePermission } from '../../../components/auth/RequirePermission';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../components/ui/Toast';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';

interface SupportMessageItem {
  id: string;
  userId?: string | null;
  name: string;
  phone: string;
  email?: string | null;
  category: string;
  orderNumber?: string | null;
  message: string;
  status: 'new' | 'in_progress' | 'resolved' | 'closed';
  adminNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_LABELS: Record<string, { ar: string; en: string }> = {
  general: { ar: 'استفسار عام', en: 'General Inquiry' },
  order: { ar: 'مشكلة في طلب', en: 'Order Issue' },
  delivery: { ar: 'شكوى توصيل', en: 'Delivery Complaint' },
  prescription: { ar: 'استفسار دواء / روشتة', en: 'Prescription Inquiry' },
  complaint: { ar: 'اقتراح / شكوى', en: 'Feedback / Complaint' },
};

const STATUS_CONFIG: Record<
  string,
  { ar: string; en: string; bg: string; text: string; border: string }
> = {
  new: {
    ar: 'جديدة',
    en: 'New',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  in_progress: {
    ar: 'قيد المتابعة',
    en: 'In Progress',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  resolved: {
    ar: 'تم الحل',
    en: 'Resolved',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
  },
  closed: {
    ar: 'مغلقة',
    en: 'Closed',
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    border: 'border-gray-200',
  },
};

function SupportMessagesContent() {
  const { isRTL } = useLanguage();
  const { showToast } = useToast();

  const [messages, setMessages] = useState<SupportMessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Notes Modal
  const [editingNotesItem, setEditingNotesItem] = useState<SupportMessageItem | null>(null);
  const [adminNotesText, setAdminNotesText] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const q = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/v1/admin/support-messages${q}`);
      if (!res.ok) throw new Error('فشل جلب رسائل الدعم');
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
    } catch {
      showToast(isRTL ? 'تعذر جلب رسائل الدعم' : 'Failed to fetch support messages', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, isRTL, showToast]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/v1/admin/support-messages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('فشل تحديث الحالة');
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: newStatus as SupportMessageItem['status'] } : m))
      );
      showToast(isRTL ? 'تم تحديث حالة الرسالة بنجاح' : 'Status updated', 'success');
    } catch {
      showToast(isRTL ? 'تعذر تحديث الحالة' : 'Failed to update status', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSaveNotes = async () => {
    if (!editingNotesItem) return;
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/v1/admin/support-messages/${editingNotesItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminNotes: adminNotesText.trim() }),
      });
      if (!res.ok) throw new Error('فشل حفظ الملاحظات');
      setMessages((prev) =>
        prev.map((m) => (m.id === editingNotesItem.id ? { ...m, adminNotes: adminNotesText.trim() } : m))
      );
      showToast(isRTL ? 'تم حفظ الملاحظات الإدارية' : 'Notes saved', 'success');
      setEditingNotesItem(null);
    } catch {
      showToast(isRTL ? 'فشل حفظ الملاحظات' : 'Failed to save notes', 'error');
    } finally {
      setSavingNotes(false);
    }
  };

  const cleanPhoneForWa = (raw: string) => {
    let p = raw.replace(/\D/g, '');
    if (p.startsWith('0')) p = '2' + p;
    if (!p.startsWith('20') && p.length === 10) p = '20' + p;
    return p;
  };

  const counts = {
    all: messages.length,
    new: messages.filter((m) => m.status === 'new').length,
    in_progress: messages.filter((m) => m.status === 'in_progress').length,
    resolved: messages.filter((m) => m.status === 'resolved').length,
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 font-arabic">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-ragab-ink-100 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-ragab-charcoal flex items-center gap-2.5">
            <Headphones className="w-6 h-6 text-ragab-brand-600" />
            <span>رسائل وشكاوى العملاء</span>
          </h1>
          <p className="text-caption text-ragab-ink-500 mt-1">
            متابعة استفسارات وشكاوى العملاء الواردة من الموقع وتطبيق الموبايل، والتواصل المباشر معهم.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<RotateCcw className="w-4 h-4" />}
          onClick={fetchMessages}
        >
          {isRTL ? 'تحديث' : 'Refresh'}
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {[
          { key: 'all', label: 'الكل', count: counts.all },
          { key: 'new', label: 'جديدة', count: counts.new, tone: 'amber' },
          { key: 'in_progress', label: 'قيد المتابعة', count: counts.in_progress, tone: 'blue' },
          { key: 'resolved', label: 'تم الحل', count: counts.resolved, tone: 'emerald' },
        ].map((tab) => {
          const active = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-body-sm font-bold transition-all shrink-0 ${
                active
                  ? 'bg-ragab-brand-600 text-white shadow-sm'
                  : 'bg-white text-ragab-ink-700 border border-ragab-ink-200 hover:bg-ragab-ink-50'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[11px] font-mono font-black ${
                  active ? 'bg-white/20 text-white' : 'bg-ragab-ink-100 text-ragab-ink-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Messages List */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-ragab-ink-100 p-12 text-center text-ragab-ink-500 space-y-3">
          <Clock className="w-8 h-8 animate-spin mx-auto text-ragab-brand-600" />
          <p className="text-body-sm font-bold">جاري تحميل رسائل الدعم والشكاوى...</p>
        </div>
      ) : messages.length === 0 ? (
        <div className="bg-white rounded-2xl border border-ragab-ink-100 p-12 text-center text-ragab-ink-500 space-y-3">
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
          <h3 className="text-lg font-bold text-ragab-charcoal">لا توجد رسائل في هذا القسم</h3>
          <p className="text-caption text-ragab-ink-500">كافة طلبات وشكاوى العملاء تمت معالجتها ومتابعتها.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {messages.map((item) => {
            const cat = CATEGORY_LABELS[item.category] || { ar: item.category, en: item.category };
            const st = STATUS_CONFIG[item.status] || STATUS_CONFIG.new;
            const waNumber = cleanPhoneForWa(item.phone);
            const waText = encodeURIComponent(
              `أهلاً بك يا ${item.name}، معك صيدلية رجب بخصوص رسالتك/شكواك:\n"${item.message.slice(0, 60)}..."`
            );

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-ragab-ink-100 p-5 shadow-sm hover:shadow-md transition-shadow space-y-4"
              >
                {/* Top row: Customer Name, Category, Status, Time */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ragab-ink-100 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-ragab-brand-50 flex items-center justify-center text-ragab-brand-700 font-bold">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-base font-black text-ragab-charcoal">{item.name}</h4>
                      <p className="text-caption text-ragab-ink-500 font-mono" dir="ltr">
                        {item.phone}
                        {item.email && <span className="ms-2 font-arabic text-gray-400">• {item.email}</span>}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-ragab-ink-100 text-ragab-ink-700">
                      {cat.ar}
                    </span>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${st.bg} ${st.text} ${st.border}`}
                    >
                      {st.ar}
                    </span>
                    <span className="text-caption text-gray-400 ms-1" dir="ltr">
                      {new Date(item.createdAt).toLocaleDateString('ar-EG', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                {/* Linked Order Number if available */}
                {item.orderNumber && (
                  <div className="flex items-center gap-2 text-xs bg-ragab-brand-50 text-ragab-brand-900 px-3 py-1.5 rounded-lg w-fit">
                    <Receipt className="w-3.5 h-3.5 text-ragab-brand-700" />
                    <span>رقم الطلب المرتبط:</span>
                    <Link
                      href={`/control-center/orders?search=${encodeURIComponent(item.orderNumber)}`}
                      className="font-mono font-black text-ragab-brand-700 hover:underline flex items-center gap-1"
                    >
                      <span>{item.orderNumber}</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                )}

                {/* Message Body */}
                <div className="bg-ragab-surface-sunken p-4 rounded-xl border border-ragab-ink-100 text-body-sm text-ragab-ink-800 leading-relaxed">
                  {item.message}
                </div>

                {/* Admin Notes if present */}
                {item.adminNotes && (
                  <div className="bg-amber-50/70 border border-amber-200/80 p-3 rounded-xl text-caption text-amber-900 space-y-1">
                    <strong className="block font-bold">ملاحظات الإدارة:</strong>
                    <p>{item.adminNotes}</p>
                  </div>
                )}

                {/* Actions Footer */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  {/* Status changer buttons */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-caption font-bold text-gray-500 me-1">تغيير الحالة:</span>
                    {(['new', 'in_progress', 'resolved', 'closed'] as const).map((s) => (
                      <button
                        key={s}
                        disabled={updatingId === item.id || item.status === s}
                        onClick={() => handleUpdateStatus(item.id, s)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                          item.status === s
                            ? 'bg-ragab-ink-800 text-white'
                            : 'bg-ragab-ink-50 hover:bg-ragab-ink-100 text-ragab-ink-700'
                        }`}
                      >
                        {STATUS_CONFIG[s].ar}
                      </button>
                    ))}
                  </div>

                  {/* Direct Contact Buttons */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<FileEdit className="w-3.5 h-3.5" />}
                      onClick={() => {
                        setEditingNotesItem(item);
                        setAdminNotesText(item.adminNotes || '');
                      }}
                    >
                      ملاحظة
                    </Button>

                    <a
                      href={`tel:${item.phone}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5 text-gray-600" />
                      <span>اتصال</span>
                    </a>

                    <a
                      href={`https://wa.me/${waNumber}?text=${waText}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-xs"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>واتساب العميل</span>
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Admin Notes Modal */}
      {editingNotesItem && (
        <Modal
          isOpen={Boolean(editingNotesItem)}
          onClose={() => setEditingNotesItem(null)}
          title={`ملاحظات على رسالة: ${editingNotesItem.name}`}
          maxWidth="md"
        >
          <div className="space-y-4 font-arabic p-1">
            <p className="text-body-sm text-gray-600">
              أضف ملاحظات داخلية لمتابعة ما تم الاتفاق عليه مع العميل أو تفاصيل حل المشكلة.
            </p>
            <textarea
              rows={4}
              value={adminNotesText}
              onChange={(e) => setAdminNotesText(e.target.value)}
              placeholder="اكتب ملاحظات الإدارة هنا..."
              className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl text-body-sm focus:border-ragab-brand-500 focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              <Button
                variant="outline"
                size="md"
                onClick={() => setEditingNotesItem(null)}
                disabled={savingNotes}
              >
                إلغاء
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleSaveNotes}
                disabled={savingNotes}
              >
                {savingNotes ? 'جاري الحفظ...' : 'حفظ الملاحظة'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function AdminSupportMessagesPage() {
  return (
    <RequirePermission resource="customers" action="view">
      <SupportMessagesContent />
    </RequirePermission>
  );
}
