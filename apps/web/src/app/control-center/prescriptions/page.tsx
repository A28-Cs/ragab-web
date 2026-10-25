'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  Search,
  Phone,
  MessageCircle,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  Loader2,
  ExternalLink,
  Plus,
  Trash2,
  Check,
  Eye,
  ShoppingBag,
  ZoomIn,
} from 'lucide-react';
import { cn } from '@ragab/utils';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../components/ui/Toast';
import { useAudit } from '../../../lib/useAudit';
import {
  getAdminPrescriptions,
  reviewAdminPrescription,
  rejectAdminPrescription,
} from '../../../services/prescriptionService';
import { getProducts } from '../../../services/productService';
import { PermissionError } from '../../../lib/rbac';
import { Prescription, PrescriptionItem, PrescriptionStatus, Product } from '../../../types';
import { RequirePermission } from '../../../components/auth/RequirePermission';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { DataTable, DataColumn } from '../../../components/ui/DataTable';
import { StatusPill } from '../../../components/ui/StatusPill';
import { Modal } from '../../../components/ui/Modal';
import { FormField } from '../../../components/ui/FormField';

function PrescriptionsAdminInner() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const { permissions, hasPermission } = useAuth();
  const { showToast } = useToast();
  const record = useAudit();

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | PrescriptionStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Review Modal State
  const [selectedRx, setSelectedRx] = useState<Prescription | null>(null);
  const [prescribedItems, setPrescribedItems] = useState<PrescriptionItem[]>([]);
  const [pharmacistNotes, setPharmacistNotes] = useState('');
  const [addToCartOption, setAddToCartOption] = useState(true);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Reject Dialog State
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);

  // Catalog Medicine Search State (inside review modal)
  const [medQuery, setMedQuery] = useState('');
  const [medResults, setMedResults] = useState<Product[]>([]);
  const [isSearchingMed, setIsSearchingMed] = useState(false);

  // Image Lightbox
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  const loadPrescriptions = async () => {
    setLoading(true);
    try {
      const res = await getAdminPrescriptions(statusFilter === 'all' ? undefined : statusFilter);
      setPrescriptions(res);
    } catch (err) {
      console.error('Failed to load prescriptions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrescriptions();
  }, [statusFilter]);

  // Search catalog medicines as doctor types
  useEffect(() => {
    if (!medQuery.trim() || medQuery.length < 2) {
      setMedResults([]);
      return;
    }
    const handler = setTimeout(async () => {
      setIsSearchingMed(true);
      try {
        const results = await getProducts({ searchQuery: medQuery.trim(), limit: 8 });
        setMedResults(results);
      } catch (e) {
        setMedResults([]);
      } finally {
        setIsSearchingMed(false);
      }
    }, 250);

    return () => clearTimeout(handler);
  }, [medQuery]);

  const openReviewModal = (rx: Prescription) => {
    setSelectedRx(rx);
    setPrescribedItems(rx.items && rx.items.length > 0 ? [...rx.items] : []);
    setPharmacistNotes(rx.pharmacistNotes || '');
    setMedQuery('');
    setMedResults([]);
  };

  const handleAddProductToPrescription = (prod: Product) => {
    const defaultVariant = prod.variants?.find((v) => v.isDefault) || prod.variants?.[0];
    const newItem: PrescriptionItem = {
      productId: prod.id,
      variantId: defaultVariant?.id,
      productNameAr: prod.nameAr,
      productNameEn: prod.nameEn,
      productImage: prod.image,
      productSlug: prod.slug,
      quantity: 1,
      price: defaultVariant ? defaultVariant.price : prod.price,
      instructions: '',
    };

    setPrescribedItems((prev) => [...prev, newItem]);
    setMedQuery('');
    setMedResults([]);
  };

  const handleRemovePrescribedItem = (index: number) => {
    setPrescribedItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateItemQty = (index: number, quantity: number) => {
    setPrescribedItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, quantity: Math.max(1, quantity) } : item))
    );
  };

  const handleUpdateItemInstructions = (index: number, instructions: string) => {
    setPrescribedItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, instructions } : item))
    );
  };

  const handleSubmitReview = async () => {
    if (!selectedRx) return;
    if (prescribedItems.length === 0) {
      showToast(ar ? 'يرجى اختيار دواء واحد على الأقل من المتجر' : 'Please add at least one medication', 'error');
      return;
    }

    setIsSubmittingReview(true);
    try {
      const updated = await reviewAdminPrescription(
        selectedRx.id,
        {
          items: prescribedItems,
          pharmacistNotes,
          addToCart: addToCartOption,
        },
        permissions
      );

      setPrescriptions((prev) => prev.map((p) => (p.id === selectedRx.id ? updated : p)));
      setSelectedRx(updated);
      record('prescription_reviewed', 'orders', selectedRx.id, {
        metadata: { itemsCount: String(prescribedItems.length) },
      });
      showToast(
        ar
          ? 'تم اعتماد الروشتة وإضافة الأدوية لسلة العميل وإرسال الإشعار بنجاح!'
          : 'Prescription approved, added to cart, and customer notified!',
        'success'
      );
      setSelectedRx(null);
    } catch (e) {
      showToast(e instanceof PermissionError ? 'ليس لديك الصلاحية' : 'حدث خطأ أثناء الاعتماد', 'error');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleSubmitReject = async () => {
    if (!selectedRx || !rejectReason.trim()) return;

    setIsSubmittingReject(true);
    try {
      const updated = await rejectAdminPrescription(selectedRx.id, rejectReason.trim(), permissions);
      setPrescriptions((prev) => prev.map((p) => (p.id === selectedRx.id ? updated : p)));
      showToast(ar ? 'تم تحديث حالة الروشتة إلى تعذر التنفيذ' : 'Prescription rejected', 'success');
      setRejectModalOpen(false);
      setSelectedRx(null);
      setRejectReason('');
    } catch (e) {
      showToast(e instanceof PermissionError ? 'ليس لديك الصلاحية' : 'حدث خطأ', 'error');
    } finally {
      setIsSubmittingReject(false);
    }
  };

  const getWhatsAppLink = (rx: Prescription) => {
    let clean = rx.customerPhone.replace(/\D/g, '');
    if (clean.startsWith('0')) clean = '2' + clean;
    else if (!clean.startsWith('20') && clean.length === 10) clean = '20' + clean;

    const totalEgp = rx.items.reduce((s, it) => s + (it.price || 0) * (it.quantity || 1), 0).toFixed(2);
    const msg = ar
      ? `أهلاً بحضرتك يا أستاذ/ة ${rx.customerName}، دكتور صيدلية رجب قام بفحص روشتتك وتم تحديد الأدوية المطلوبة وإضافتها إلى سلتك بإجمالي ${totalEgp} ج.م.\nيمكنك مراجعة الأدوية وإتمام طلبك عبر الرابط:\nhttps://ragab-pharmacy.com/prescription?id=${rx.id}`
      : `Hello ${rx.customerName}, your prescription #${rx.id} has been reviewed at Ragab Pharmacy and medications have been added to your cart for ${totalEgp} EGP. View here: https://ragab-pharmacy.com/prescription?id=${rx.id}`;

    return `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`;
  };

  const statusTone = (status: PrescriptionStatus) => {
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

  const statusLabel = (status: PrescriptionStatus) => {
    switch (status) {
      case 'reviewed':
        return ar ? 'تم التجهيز والسلة' : 'Reviewed & In Cart';
      case 'pending':
        return ar ? 'قيد المراجعة' : 'Pending Review';
      case 'completed':
        return ar ? 'تم الطلب' : 'Ordered';
      case 'rejected':
        return ar ? 'تعذر التنفيذ' : 'Rejected';
      default:
        return status;
    }
  };

  const filteredPrescriptions = useMemo(() => {
    if (!searchQuery.trim()) return prescriptions;
    const q = searchQuery.toLowerCase().trim();
    return prescriptions.filter(
      (rx) =>
        rx.customerName.toLowerCase().includes(q) ||
        rx.customerPhone.includes(q) ||
        rx.id.toLowerCase().includes(q)
    );
  }, [prescriptions, searchQuery]);

  const pendingCount = useMemo(() => {
    return prescriptions.filter((p) => p.status === 'pending').length;
  }, [prescriptions]);

  const columns: DataColumn<Prescription>[] = [
    {
      key: 'rx',
      header: ar ? 'الروشتة' : 'Prescription',
      cell: (r) => (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={r.imageUrl}
            alt="Prescription"
            className="w-12 h-12 rounded-xl object-cover border border-ragab-ink-100 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setLightboxImg(r.imageUrl)}
            title={ar ? 'انقر لتكبير الروشتة' : 'Click to enlarge'}
          />
          <div>
            <span className="font-mono font-bold text-caption text-ragab-brand-800 block">
              #{r.id}
            </span>
            <span className="text-body-sm font-bold text-ragab-ink-900 block">
              {r.customerName}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: ar ? 'بيانات التواصل' : 'Contact',
      cell: (r) => (
        <div className="space-y-1">
          <div dir="ltr" className="text-caption font-mono font-semibold text-ragab-ink-700">
            {r.customerPhone}
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`tel:${r.customerPhone}`}
              className="p-1 rounded-md bg-ragab-ink-100 hover:bg-ragab-ink-200 text-ragab-ink-700 transition-colors"
              title={ar ? 'اتصال هاتفي' : 'Call'}
            >
              <Phone className="w-3.5 h-3.5" />
            </a>
            <a
              href={getWhatsAppLink(r)}
              target="_blank"
              rel="noreferrer"
              className="p-1 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-800 transition-colors"
              title={ar ? 'واتساب' : 'WhatsApp'}
            >
              <MessageCircle className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      ),
    },
    {
      key: 'notes',
      header: ar ? 'ملاحظات العميل' : 'Customer Notes',
      hideOnMobile: true,
      cell: (r) => (
        <p className="text-body-sm text-ragab-ink-600 max-w-xs truncate" title={r.notes || undefined}>
          {r.notes || <span className="text-ragab-ink-300">—</span>}
        </p>
      ),
    },
    {
      key: 'items',
      header: ar ? 'الأدوية المحددة' : 'Prescribed Items',
      align: 'center',
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-body-sm font-bold text-ragab-ink-800">
          {r.items && r.items.length > 0 ? (
            <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
              {r.items.length} {ar ? 'أصناف' : 'items'}
            </span>
          ) : (
            <span className="text-ragab-ink-400">—</span>
          )}
        </span>
      ),
    },
    {
      key: 'date',
      header: ar ? 'التاريخ' : 'Date',
      hideOnMobile: true,
      cell: (r) => {
        const d = new Date(r.createdAt);
        return (
          <span className="text-caption text-ragab-ink-500 whitespace-nowrap">
            {d.toLocaleDateString(ar ? 'ar-EG' : 'en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: ar ? 'الحالة' : 'Status',
      align: 'center',
      cell: (r) => <StatusPill tone={statusTone(r.status)}>{statusLabel(r.status)}</StatusPill>,
    },
    {
      key: 'actions',
      header: '',
      align: 'end',
      cell: (r) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => openReviewModal(r)}
            className="bg-ragab-brand-600 hover:bg-ragab-brand-700 text-white"
            leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
          >
            {r.status === 'reviewed' ? (ar ? 'تعديل الأدوية' : 'Edit') : (ar ? 'فحص وتحديد العلاج' : 'Review')}
          </Button>
          <a
            href={getWhatsAppLink(r)}
            target="_blank"
            rel="noreferrer"
            className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors"
            title={ar ? 'إرسال رسالة واتساب للعميل' : 'Send WhatsApp Message'}
          >
            <MessageCircle className="w-4 h-4" />
          </a>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Switcher between Orders, Product Requests, and Prescriptions */}
      <div className="flex items-center gap-2 border-b border-ragab-ink-100 pb-3 flex-wrap">
        <Link
          href="/control-center/orders"
          className="px-4 py-2 rounded-xl text-body-sm font-bold bg-white hover:bg-ragab-ink-50 text-ragab-ink-700 border border-ragab-ink-200 transition-colors"
        >
          {ar ? 'طلبات الشراء' : 'Orders'}
        </Link>
        <Link
          href="/control-center/product-requests"
          className="px-4 py-2 rounded-xl text-body-sm font-bold bg-white hover:bg-ragab-ink-50 text-ragab-ink-700 border border-ragab-ink-200 transition-colors"
        >
          {ar ? 'طلبات التوفير' : 'Stock Requests'}
        </Link>
        <Link
          href="/control-center/prescriptions"
          className="px-4 py-2 rounded-xl text-body-sm font-bold bg-ragab-brand-500 text-white shadow-sm flex items-center gap-1.5"
        >
          <FileText className="w-4 h-4" />
          <span>{ar ? 'طلبات الروشتات' : 'Prescription Requests'}</span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-white/20 text-white font-mono">
              {pendingCount}
            </span>
          )}
        </Link>
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-h2 text-ragab-ink-800">
            {ar ? 'إدارة طلبات الروشتات الطبية' : 'Prescription Orders Management'}
          </h2>
          <p className="text-body-sm text-ragab-ink-500 mt-0.5">
            {ar
              ? 'مراجعة صور الروشتات، تحديد الأدوية من المخزون، وإضافتها لسلة العميل مع إشعار فوري'
              : 'Review prescriptions, select medications from catalog, and add to customer cart.'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadPrescriptions}
          isLoading={loading}
          leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
        >
          {ar ? 'تحديث البيانات' : 'Refresh'}
        </Button>
      </div>

      {/* Filters and search */}
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3 items-center">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(['all', 'pending', 'reviewed', 'rejected'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={cn(
                'px-3.5 py-1.5 rounded-xl text-body-sm font-bold transition-colors whitespace-nowrap',
                statusFilter === st
                  ? 'bg-ragab-brand-500 text-white shadow-sm'
                  : 'bg-white text-ragab-ink-700 border border-ragab-ink-200 hover:bg-ragab-ink-50'
              )}
            >
              {st === 'all'
                ? (ar ? 'الكل' : 'All')
                : st === 'pending'
                ? (ar ? `قيد المراجعة (${pendingCount})` : `Pending (${pendingCount})`)
                : st === 'reviewed'
                ? (ar ? 'تم التجهيز والسلة' : 'Reviewed')
                : (ar ? 'تعذر التنفيذ' : 'Rejected')}
            </button>
          ))}
        </div>
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={ar ? 'بحث باسم العميل أو رقم الهاتف أو رقم الروشتة...' : 'Search by name, phone, ID...'}
          startIcon={<Search className="w-4 h-4" />}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-ragab-ink-400" />
        </div>
      ) : filteredPrescriptions.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-ragab-ink-200 p-8 space-y-3">
          <div className="w-12 h-12 rounded-full bg-ragab-brand-50 text-ragab-brand-600 flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-h3 font-bold text-ragab-ink-800">
            {ar ? 'لا توجد طلبات روشتات حالياً' : 'No prescriptions found'}
          </h3>
          <p className="text-body-sm text-ragab-ink-500 max-w-sm mx-auto">
            {ar
              ? 'عند قيام العملاء برفع صور الروشتات من المتجر، ستظهر طلباتهم هنا مباشرة لفحصها وتحديد العلاج.'
              : 'Customer uploaded prescriptions will appear here for doctor review.'}
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filteredPrescriptions}
          keyField={(r) => r.id}
          mobileTitle={(r) => (
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={r.imageUrl}
                alt=""
                className="w-9 h-9 rounded-lg object-cover border border-ragab-ink-100"
              />
              <div>
                <span className="text-ragab-ink-900 font-bold block">{r.customerName}</span>
                <span className="text-caption text-ragab-ink-500 font-semibold">{r.customerPhone}</span>
              </div>
            </div>
          )}
          mobileMeta={(r) => (
            <Button variant="outline" size="sm" onClick={() => openReviewModal(r)}>
              {ar ? 'فحص الروشتة' : 'Review'}
            </Button>
          )}
        />
      )}

      {/* ========================================================= */}
      {/* Doctor Review & Prescribe Modal */}
      {/* ========================================================= */}
      {selectedRx && (
        <Modal
          isOpen={!!selectedRx}
          onClose={() => setSelectedRx(null)}
          title={ar ? `فحص الروشتة #${selectedRx.id} · ${selectedRx.customerName}` : `Review Prescription #${selectedRx.id}`}
          maxWidth="xl"
        >
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Prescription Image (Zoomable) */}
              <div className="lg:col-span-5 space-y-2">
                <div className="flex items-center justify-between text-caption font-bold text-ragab-ink-700">
                  <span>{ar ? 'صورة الروشتة' : 'Prescription Photo'}</span>
                  <button
                    type="button"
                    onClick={() => setLightboxImg(selectedRx.imageUrl)}
                    className="inline-flex items-center gap-1 text-ragab-brand-700 hover:text-ragab-brand-900"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                    <span>{ar ? 'تكبير كامل' : 'Zoom'}</span>
                  </button>
                </div>
                <div className="rounded-2xl border border-ragab-ink-200 overflow-hidden bg-ragab-surface-sunken p-2 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedRx.imageUrl}
                    alt="Prescription"
                    className="max-h-80 w-auto object-contain rounded-xl cursor-pointer hover:scale-105 transition-transform"
                    onClick={() => setLightboxImg(selectedRx.imageUrl)}
                    title={ar ? 'اضغط لتكبير الصورة وقراءتها بوضوح' : 'Click to enlarge'}
                  />
                </div>
                {selectedRx.notes && (
                  <div className="p-3 bg-ragab-brand-50/60 rounded-xl border border-ragab-brand-200 text-body-sm text-ragab-brand-950">
                    <span className="font-bold block text-caption text-ragab-brand-800">
                      {ar ? 'ملاحظات العميل:' : 'Customer Notes:'}
                    </span>
                    {selectedRx.notes}
                  </div>
                )}
                <div className="text-caption text-ragab-ink-500 font-semibold space-y-1 pt-1">
                  <div>{ar ? 'الهاتف: ' : 'Phone: '} <span dir="ltr" className="font-mono font-bold text-ragab-ink-800">{selectedRx.customerPhone}</span></div>
                  <div>{ar ? 'التاريخ: ' : 'Date: '} {new Date(selectedRx.createdAt).toLocaleString(ar ? 'ar-EG' : 'en-US')}</div>
                </div>
              </div>

              {/* Medicine Selection Panel */}
              <div className="lg:col-span-7 space-y-4">
                <div className="space-y-1">
                  <h4 className="font-extrabold text-body text-ragab-ink-900">
                    {ar ? 'تحديد الأدوية من مخزون الصيدلية' : 'Select Medicines from Store Catalog'}
                  </h4>
                  <p className="text-caption text-ragab-ink-500">
                    {ar
                      ? 'ابحث باسم الدواء التجاري أو العلمي لإضافته للروشتة'
                      : 'Search store catalog by commercial or generic name'}
                  </p>
                </div>

                {/* Catalog Search Input */}
                <div className="relative">
                  <Input
                    value={medQuery}
                    onChange={(e) => setMedQuery(e.target.value)}
                    placeholder={ar ? 'ابحث باسم الدواء (مثال: بنادول، كونكور، اوجمنتين)...' : 'Search medication...'}
                    startIcon={<Search className="w-4 h-4" />}
                  />
                  {isSearchingMed && (
                    <Loader2 className="absolute end-3 top-3 w-4 h-4 animate-spin text-ragab-brand-600" />
                  )}

                  {/* Dropdown Results */}
                  {medResults.length > 0 && (
                    <div className="absolute top-full inset-x-0 mt-1 bg-white rounded-xl shadow-xl border border-ragab-ink-200 z-50 max-h-60 overflow-y-auto divide-y divide-ragab-ink-100">
                      {medResults.map((prod) => (
                        <div
                          key={prod.id}
                          onClick={() => handleAddProductToPrescription(prod)}
                          className="p-3 flex items-center justify-between gap-3 hover:bg-ragab-brand-50/60 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={prod.image} alt="" className="w-9 h-9 rounded-lg object-contain border border-ragab-ink-100 p-0.5 bg-white" />
                            <div>
                              <p className="font-bold text-body-sm text-ragab-ink-900">{prod.nameAr}</p>
                              <p className="text-caption text-ragab-ink-500">
                                {prod.price.toFixed(2)} {ar ? 'ج.م' : 'EGP'} · {prod.unitAr}
                              </p>
                            </div>
                          </div>
                          <Button size="sm" variant="primary" leftIcon={<Plus className="w-3 h-3" />}>
                            {ar ? 'إضافة' : 'Add'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected Prescribed Medicines List */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-caption font-bold text-ragab-ink-700">
                    <span>{ar ? `الأدوية المحددة (${prescribedItems.length})` : `Selected Items (${prescribedItems.length})`}</span>
                    {prescribedItems.length > 0 && (
                      <span className="text-ragab-brand-800 font-extrabold text-body-sm">
                        {ar ? 'الإجمالي: ' : 'Total: '}
                        {prescribedItems
                          .reduce((s, it) => s + (it.price || 0) * (it.quantity || 1), 0)
                          .toFixed(2)}{' '}
                        {ar ? 'ج.م' : 'EGP'}
                      </span>
                    )}
                  </div>

                  {prescribedItems.length === 0 ? (
                    <div className="p-6 rounded-2xl border border-dashed border-ragab-ink-200 text-center text-caption text-ragab-ink-400">
                      {ar ? 'لم يتم تحديد أي دواء بعد. استخدم خانة البحث أعلاه لاختيار الأدوية.' : 'No items added yet. Search above to add.'}
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto pe-1">
                      {prescribedItems.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl border border-ragab-ink-200 bg-white space-y-2 shadow-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-body-sm text-ragab-ink-900 truncate">
                              {item.productNameAr}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-body-sm text-ragab-ink-800">
                                {((item.price || 0) * item.quantity).toFixed(2)} {ar ? 'ج.م' : 'EGP'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemovePrescribedItem(idx)}
                                className="p-1 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-caption text-ragab-ink-500 shrink-0">{ar ? 'العدد:' : 'Qty:'}</span>
                              <input
                                type="number"
                                min={1}
                                max={20}
                                value={item.quantity}
                                onChange={(e) => handleUpdateItemQty(idx, Number(e.target.value))}
                                className="w-16 h-8 text-center rounded-lg border border-ragab-ink-200 text-caption font-bold"
                              />
                            </div>
                            <input
                              type="text"
                              value={item.instructions || ''}
                              onChange={(e) => handleUpdateItemInstructions(idx, e.target.value)}
                              placeholder={ar ? 'الجرعة (مثال: قرص بعد الأكل)' : 'Dosage instructions'}
                              className="h-8 px-2.5 rounded-lg border border-ragab-ink-200 text-caption text-ragab-ink-800 font-arabic"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pharmacist Advice / Notes */}
                <FormField label={ar ? 'إرشادات ونصائح الصيدلي للعميل' : 'Pharmacist Advice for Customer'}>
                  <textarea
                    rows={2}
                    value={pharmacistNotes}
                    onChange={(e) => setPharmacistNotes(e.target.value)}
                    placeholder={ar ? 'مثال: تم توفير بديل مصري بنفس المادة الفعالة، يؤخذ قرص كل 12 ساعة...' : 'Advice on usage, generic substitutes, etc.'}
                    className="w-full px-3 py-2 rounded-xl border border-ragab-ink-200 text-caption font-arabic resize-y focus:outline-none focus:ring-2 focus:ring-ragab-brand-500"
                  />
                </FormField>

                {/* Add to Cart Checkbox */}
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={addToCartOption}
                    onChange={(e) => setAddToCartOption(e.target.checked)}
                    className="w-4 h-4 rounded text-ragab-brand-600 focus:ring-ragab-brand-500"
                  />
                  <span className="text-caption font-bold text-ragab-ink-800">
                    {ar ? 'إضافة الأدوية مباشرة إلى سلة العميل في المتجر وإرسال إشعار فوري له' : 'Add items directly to customer cart & send notification'}
                  </span>
                </label>
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="flex items-center justify-between gap-3 pt-4 border-t border-ragab-ink-100 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRejectModalOpen(true)}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                {ar ? 'تعذر التنفيذ / رفض الروشتة' : 'Reject Prescription'}
              </Button>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedRx(null)}>
                  {ar ? 'إغلاق' : 'Close'}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSubmitReview}
                  isLoading={isSubmittingReview}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                  leftIcon={<Check className="w-4 h-4" />}
                >
                  {ar ? 'اعتماد الروشتة وإضافتها للسلة' : 'Approve & Add to Cart'}
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Reason Modal */}
      {rejectModalOpen && (
        <Modal
          isOpen={rejectModalOpen}
          onClose={() => setRejectModalOpen(false)}
          title={ar ? 'تحديد سبب تعذر تنفيذ الروشتة' : 'Rejection Reason'}
          maxWidth="sm"
        >
          <div className="space-y-4">
            <p className="text-body-sm text-ragab-ink-600">
              {ar
                ? 'سيتم إشعار العميل بهذا السبب لتعديل الروشتة أو التواصل مع الصيدلي.'
                : 'Customer will be notified with this reason.'}
            </p>
            <FormField label={ar ? 'سبب الرفض أو الملاحظة' : 'Reason'}>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={ar ? 'مثال: الخط غير واضح، أو يتطلب أدوية محظورة بدون موافقة، أو الأدوية غير متوفرة حالياً...' : 'Reason for rejection'}
                className="w-full px-3 py-2 rounded-xl border border-ragab-ink-200 text-body-sm font-arabic resize-y"
              />
            </FormField>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setRejectModalOpen(false)}>
                {ar ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmitReject}
                isLoading={isSubmittingReject}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {ar ? 'تأكيد الرفض' : 'Confirm'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Lightbox for Zooming Prescription Photo */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setLightboxImg(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxImg}
              alt="Prescription Large"
              className="max-h-[85vh] w-auto object-contain rounded-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              onClick={() => setLightboxImg(null)}
              className="mt-3 px-4 py-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white text-caption font-bold transition-colors"
            >
              {ar ? 'إغلاق الصورة (ESC)' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PrescriptionsAdminPage() {
  return (
    <RequirePermission resource="orders" action="view">
      <PrescriptionsAdminInner />
    </RequirePermission>
  );
}
