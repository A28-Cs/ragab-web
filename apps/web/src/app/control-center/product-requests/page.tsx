'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BellRing,
  Phone,
  MessageCircle,
  CheckCircle2,
  ExternalLink,
  RotateCcw,
  Loader2,
  PackageCheck,
  Check,
  FileText,
  PackageSearch,
} from 'lucide-react';
import { cn } from '@ragab/utils';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../components/ui/Toast';
import { useAudit } from '../../../lib/useAudit';
import {
  getAdminProductRequests,
  updateProductRequestStatus,
  updateStock,
} from '../../../services/productService';
import { PermissionError } from '../../../lib/rbac';
import { ProductRequest, ProductRequestStatus } from '../../../types';
import { RequirePermission } from '../../../components/auth/RequirePermission';
import { Button } from '../../../components/ui/Button';
import { DataTable, DataColumn } from '../../../components/ui/DataTable';
import { StatusPill } from '../../../components/ui/StatusPill';
import { Drawer } from '../../../components/ui/Drawer';
import { Modal } from '../../../components/ui/Modal';
import { FormField } from '../../../components/ui/FormField';
import { Input } from '../../../components/ui/Input';

interface StockTarget {
  productId: string;
  variantId?: string;
  variantName?: string;
  nameAr: string;
  image: string;
}

function ProductRequestsInner() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const { permissions, hasPermission } = useAuth();
  const { showToast } = useToast();
  const record = useAudit();

  const [requests, setRequests] = useState<ProductRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | ProductRequestStatus>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Stock update drawer
  const [stockTarget, setStockTarget] = useState<StockTarget | null>(null);
  const [stockQty, setStockQty] = useState(10);
  const [savingStock, setSavingStock] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const res = await getAdminProductRequests(statusFilter === 'all' ? undefined : statusFilter);
      setRequests(res);
    } catch (err) {
      console.error('Failed to load product requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [statusFilter]);

  const pendingCount = useMemo(() => {
    return requests.filter((r) => r.status === 'pending').length;
  }, [requests]);

  const handleUpdateStatus = async (id: string, newStatus: ProductRequestStatus) => {
    setUpdatingId(id);
    try {
      await updateProductRequestStatus(id, newStatus, permissions);
      setRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: newStatus,
                fulfilledAt: newStatus === 'fulfilled' ? new Date().toISOString() : r.fulfilledAt,
              }
            : r
        )
      );
      showToast(ar ? 'تم تحديث حالة طلب التوفير بنجاح' : 'Request status updated', 'success');
      record('inventory_adjusted', 'inventory', id, { metadata: { status: newStatus } });
    } catch (e) {
      showToast(e instanceof PermissionError ? 'ليس لديك الصلاحية' : 'حدث خطأ', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const onSaveStock = async () => {
    if (!stockTarget) return;
    setSavingStock(true);
    try {
      await updateStock(stockTarget.productId, stockQty, permissions, stockTarget.variantId);
      record('inventory_adjusted', 'inventory', stockTarget.nameAr, { metadata: { quantity: String(stockQty) } });
      showToast(ar ? 'تم تحديث المخزون بنجاح' : 'Stock updated successfully', 'success');
      setStockTarget(null);
      await loadRequests();
    } catch (e) {
      showToast(e instanceof PermissionError ? 'ليس لديك الصلاحية' : 'حدث خطأ', 'error');
    } finally {
      setSavingStock(false);
    }
  };

  const getWhatsAppLink = (phone: string, customerName: string, productName: string) => {
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('0')) clean = '2' + clean;
    else if (!clean.startsWith('20') && clean.length === 10) clean = '20' + clean;
    const msg = ar
      ? `أهلاً يا ${customerName}، بنبلغ حضرتك بخصوص طلب توفير منتج "${productName}" في صيدلية رجب.`
      : `Hello ${customerName}, regarding your request for "${productName}" at Ragab Pharmacy.`;
    return `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`;
  };

  const requestTone = (status: ProductRequestStatus) => {
    switch (status) {
      case 'fulfilled':
        return 'success';
      case 'pending':
        return 'warning';
      case 'cancelled':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  const requestLabel = (status: ProductRequestStatus) => {
    switch (status) {
      case 'fulfilled':
        return ar ? 'تم التوفير' : 'Fulfilled';
      case 'pending':
        return ar ? 'قيد الانتظار' : 'Pending';
      case 'cancelled':
        return ar ? 'ملغي' : 'Cancelled';
      default:
        return status;
    }
  };

  const columns: DataColumn<ProductRequest>[] = [
    {
      key: 'product',
      header: ar ? 'المنتج المطلوب' : 'Requested Product',
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'w-11 h-11 rounded-lg border border-ragab-ink-100 shrink-0 relative overflow-hidden bg-ragab-ink-50 flex items-center justify-center',
              r.productImage ? 'cursor-pointer hover:opacity-80' : ''
            )}
            onClick={() => r.productImage && setPreviewImage(r.productImage)}
            title={r.productImage ? (ar ? 'اضغط لتكبير الصورة' : 'Click to enlarge') : undefined}
          >
            {r.productImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.productImage}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <PackageSearch className="w-5 h-5 text-ragab-ink-400" />
            )}
          </div>
          <div>
            {r.productId ? (
              <a
                href={r.productSlug ? `/product/${r.productSlug}` : `/product/${r.productId}`}
                target="_blank"
                rel="noreferrer"
                className="font-bold text-ragab-ink-900 hover:text-ragab-brand-600 transition-colors inline-flex items-center gap-1"
              >
                <span>{r.productNameAr}</span>
                <ExternalLink className="w-3 h-3 text-ragab-ink-400" />
              </a>
            ) : (
              <div className="space-y-0.5">
                <span className="font-bold text-ragab-ink-900 block">{r.productNameAr}</span>
                <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                  {ar ? 'طلب خاص (غير متوفر بالكتالوج)' : 'Custom Sourcing Request'}
                </span>
              </div>
            )}
            {r.variantName && (
              <div className="text-caption font-bold text-ragab-brand-700">
                — {r.variantName}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'customer',
      header: ar ? 'بيانات العميل' : 'Customer Info',
      cell: (r) => (
        <div className="space-y-1">
          <div className="font-bold text-ragab-ink-800">{r.customerName}</div>
          <div className="flex items-center gap-2 text-caption">
            <span dir="ltr" className="text-ragab-ink-600 font-mono font-semibold">
              {r.customerPhone}
            </span>
            <a
              href={`tel:${r.customerPhone}`}
              className="p-1 rounded-md bg-ragab-ink-100 hover:bg-ragab-ink-200 text-ragab-ink-700 transition-colors"
              title={ar ? 'اتصال بالهاتف' : 'Call'}
            >
              <Phone className="w-3.5 h-3.5" />
            </a>
            <a
              href={getWhatsAppLink(r.customerPhone, r.customerName, r.productNameAr)}
              target="_blank"
              rel="noreferrer"
              className="p-1 rounded-md bg-[#25D366] hover:bg-[#20bd5a] text-white transition-colors"
              title={ar ? 'مراسلة واتساب' : 'WhatsApp'}
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
      key: 'date',
      header: ar ? 'تاريخ الطلب' : 'Date',
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
      cell: (r) => <StatusPill tone={requestTone(r.status)}>{requestLabel(r.status)}</StatusPill>,
    },
    {
      key: 'actions',
      header: '',
      align: 'end',
      cell: (r) => (
        <div className="flex items-center justify-end gap-1.5 flex-wrap">
          {r.status === 'pending' ? (
            <Button
              variant="primary"
              size="sm"
              isLoading={updatingId === r.id}
              onClick={() => handleUpdateStatus(r.id, 'fulfilled')}
              leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
              className="bg-ragab-brand-700 hover:bg-ragab-brand-800 text-white"
            >
              {ar ? 'تم التوفير' : 'Fulfill'}
            </Button>
          ) : r.status === 'fulfilled' ? (
            <Button
              variant="outline"
              size="sm"
              isLoading={updatingId === r.id}
              onClick={() => handleUpdateStatus(r.id, 'pending')}
            >
              {ar ? 'إعادة فتح' : 'Reopen'}
            </Button>
          ) : null}
          {r.status === 'pending' && (
            <Button
              variant="ghost"
              size="sm"
              isLoading={updatingId === r.id}
              onClick={() => handleUpdateStatus(r.id, 'cancelled')}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              {ar ? 'إلغاء' : 'Cancel'}
            </Button>
          )}
          {r.productId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStockTarget({
                  productId: r.productId!,
                  variantId: r.variantId,
                  variantName: r.variantName,
                  nameAr: r.productNameAr,
                  image: r.productImage || '',
                });
                setStockQty(10);
              }}
              disabled={!hasPermission('inventory', 'edit')}
            >
              {ar ? 'تحديث المخزون' : 'Stock'}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Switcher between Orders and Product Requests */}
      <div className="flex items-center gap-2 border-b border-ragab-ink-100 pb-3">
        <Link
          href="/control-center/orders"
          className="px-4 py-2 rounded-xl text-body-sm font-bold bg-white hover:bg-ragab-ink-50 text-ragab-ink-700 border border-ragab-ink-200 transition-colors"
        >
          {ar ? 'طلبات الشراء' : 'Customer Orders'}
        </Link>
        <Link
          href="/control-center/prescriptions"
          className="px-4 py-2 rounded-xl text-body-sm font-bold bg-white hover:bg-ragab-ink-50 text-ragab-ink-700 border border-ragab-ink-200 transition-colors inline-flex items-center gap-1.5"
        >
          <FileText className="w-4 h-4 text-ragab-brand-600" />
          <span>{ar ? 'طلبات الروشتات' : 'Prescriptions'}</span>
        </Link>
        <Link
          href="/control-center/product-requests"
          className="px-4 py-2 rounded-xl text-body-sm font-bold bg-ragab-brand-500 text-white shadow-sm flex items-center gap-1.5"
        >
          <BellRing className="w-4 h-4" />
          <span>{ar ? 'طلبات التوفير' : 'Stock Requests'}</span>
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
            {ar ? 'طلبات توفير المنتجات' : 'Out-of-Stock Product Requests'}
          </h2>
          <p className="text-body-sm text-ragab-ink-500 mt-0.5">
            {ar
              ? 'متابعة طلبات العملاء للمنتجات غير المتوفرة للتواصل معهم فور توفرها'
              : 'Track customer requests for out-of-stock items to contact them once restocked.'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadRequests}
          isLoading={loading}
          leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
        >
          {ar ? 'تحديث البيانات' : 'Refresh'}
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {(['all', 'pending', 'fulfilled', 'cancelled'] as const).map((st) => (
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
              ? (ar ? 'قيد الانتظار' : 'Pending')
              : st === 'fulfilled'
              ? (ar ? 'تم التوفير' : 'Fulfilled')
              : (ar ? 'ملغي' : 'Cancelled')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-ragab-ink-400" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-ragab-ink-200 p-8 space-y-3">
          <div className="w-12 h-12 rounded-full bg-ragab-brand-50 text-ragab-brand-600 flex items-center justify-center mx-auto">
            <BellRing className="w-6 h-6" />
          </div>
          <h3 className="text-h3 font-bold text-ragab-ink-800">
            {ar ? 'لا توجد طلبات توفير حالياً' : 'No product requests found'}
          </h3>
          <p className="text-body-sm text-ragab-ink-500 max-w-sm mx-auto">
            {ar
              ? 'عند قيام العملاء بطلب توفير أي منتج غير متوفر، ستظهر طلباتهم وأرقام هواتفهم هنا مباشرة.'
              : 'When customers request out-of-stock items, their requests and contact info will appear here.'}
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={requests}
          keyField={(r) => r.id}
          mobileTitle={(r) => (
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={r.productImage || '/placeholder.png'}
                alt=""
                className="w-9 h-9 rounded-lg object-cover border border-ragab-ink-100"
              />
              <div>
                <span className="text-ragab-ink-900 font-bold block">{r.productNameAr}</span>
                <span className="text-caption text-ragab-ink-500 font-semibold">
                  {r.customerName} - {r.customerPhone}
                </span>
              </div>
            </div>
          )}
          mobileMeta={(r) => (
            <StatusPill tone={requestTone(r.status)}>{requestLabel(r.status)}</StatusPill>
          )}
        />
      )}

      {/* Drawer for updating product stock directly */}
      <Drawer
        isOpen={!!stockTarget}
        onClose={() => setStockTarget(null)}
        title={ar ? 'تحديث كمية المخزون' : 'Update Stock'}
        position="bottom"
        size="sm"
      >
        {stockTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={stockTarget.image || '/placeholder.png'}
                alt=""
                className="w-12 h-12 rounded-lg object-cover border border-ragab-ink-100"
              />
              <p className="font-bold text-ragab-ink-800">
                {stockTarget.nameAr}
                {stockTarget.variantName ? ` — ${stockTarget.variantName}` : ''}
              </p>
            </div>
            <FormField label={ar ? 'الكمية الجديدة بالمخزون' : 'New stock quantity'}>
              <Input
                type="number"
                min={0}
                value={stockQty}
                onChange={(e) => setStockQty(Math.max(0, Number(e.target.value)))}
                startIcon={<PackageCheck className="w-4 h-4" />}
              />
            </FormField>
            <Button
              variant="primary"
              fullWidth
              onClick={onSaveStock}
              isLoading={savingStock}
              leftIcon={<Check className="w-4 h-4" />}
            >
              {ar ? 'حفظ وتحديث المخزون' : 'Save Changes'}
            </Button>
          </div>
        )}
      </Drawer>

      {/* Product Image Lightbox Modal */}
      {previewImage && (
        <Modal
          isOpen={Boolean(previewImage)}
          onClose={() => setPreviewImage(null)}
          title={ar ? 'صورة المنتج المطلوب' : 'Requested Product Image'}
          maxWidth="lg"
        >
          <div className="p-4 flex items-center justify-center bg-ragab-surface-sunken rounded-2xl overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt=""
              className="max-h-[70vh] object-contain rounded-xl shadow-sm"
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function ProductRequestsPage() {
  return (
    <RequirePermission resource="inventory" action="view">
      <ProductRequestsInner />
    </RequirePermission>
  );
}
