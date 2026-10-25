'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search, Loader2, Check, PackageCheck, Layers } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../components/ui/Toast';
import { useAudit } from '../../../lib/useAudit';
import { getAdminProductsPage, updateStock, bulkUpdateStock } from '../../../services/productService';
import { getCategories } from '../../../services/categoryService';
import { PermissionError } from '../../../lib/rbac';
import { Product, Category } from '../../../types';
import { RequirePermission } from '../../../components/auth/RequirePermission';
import { Can } from '../../../components/auth/Can';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Tabs } from '../../../components/ui/Tabs';
import { FormField } from '../../../components/ui/FormField';
import { DataTable, DataColumn } from '../../../components/ui/DataTable';
import { Checkbox } from '../../../components/ui/Checkbox';
import { StatusPill } from '../../../components/ui/StatusPill';
import { Drawer } from '../../../components/ui/Drawer';
import { Modal } from '../../../components/ui/Modal';

/** One table row per stocked UNIT: a multi-unit product expands into one row per active variant (0007). */
type Row = Product & { productId: string; variantId?: string; variantName?: string };

const LOW = 5;

function InventoryInner() {
  const { t, language } = useLanguage();
  const ar = language === 'ar';
  const { permissions, hasPermission } = useAuth();
  const { showToast } = useToast();
  const record = useAudit();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [catFilter, setCatFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [tab, setTab] = useState<'all' | 'low'>('all');
  const [target, setTarget] = useState<Row | null>(null);
  const [qty, setQty] = useState(0);
  const [saving, setSaving] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalItems, setTotalItems] = useState(0);

  // Bulk update states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkQty, setBulkQty] = useState(100);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Category bulk update states
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [targetCategory, setTargetCategory] = useState('');
  const [categoryQty, setCategoryQty] = useState(100);
  const [categorySaving, setCategorySaving] = useState(false);

  useEffect(() => {
    getCategories().then((cats) => {
      setCategories(cats);
      if (cats.length > 0) setTargetCategory(cats[0].id);
    });
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handler);
  }, [query]);

  const load = async (reset = true) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await getAdminProductsPage({
        categoryId: catFilter === 'all' ? undefined : catFilter,
        searchQuery: debouncedQuery || undefined,
        lowStockOnly: tab === 'low' ? true : undefined,
        cursor: reset ? undefined : (nextCursor ?? undefined),
        limit: 20,
      });
      setProducts((prev) => (reset ? res.items : [...prev, ...res.items]));
      setNextCursor(res.nextCursor ?? null);
      setHasMore(res.hasMore);
      if (res.total !== undefined) setTotalItems(res.total);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setNextCursor(null);
    setSelectedIds(new Set());
    load(true);
  }, [debouncedQuery, tab, catFilter]);

  const rows = useMemo<Row[]>(
    () =>
      products.flatMap((p) => {
        const active = (p.variants ?? []).filter((v) => v.isActive);
        if (active.length <= 1) return [{ ...p, productId: p.id, variantId: active[0]?.id }];
        return active.map((v) => ({ ...p, id: `${p.id}::${v.id}`, productId: p.id, variantId: v.id, variantName: v.nameAr, stockQuantity: v.stockQuantity }));
      }),
    [products],
  );

  const allRowIds = rows.map((r) => r.id);
  const selectedOnPage = allRowIds.filter((id) => selectedIds.has(id));
  const isAllSelected = allRowIds.length > 0 && selectedOnPage.length === allRowIds.length;
  const isPartiallySelected = selectedOnPage.length > 0 && !isAllSelected;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allRowIds));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const tone = (p: Product) => (p.stockQuantity === 0 ? 'danger' : p.stockQuantity <= (p.lowStockThreshold ?? LOW) ? 'warning' : 'success');
  const label = (p: Product) => (p.stockQuantity === 0 ? t.adminInventory.out : p.stockQuantity <= (p.lowStockThreshold ?? LOW) ? t.adminInventory.low : t.adminInventory.inStock);

  const openUpdate = (p: Row) => { setTarget(p); setQty(p.stockQuantity); };

  const onSave = async () => {
    if (!target) return;
    setSaving(true);
    try {
      await updateStock(target.productId, qty, permissions, target.variantId);
      record('inventory_adjusted', 'inventory', target.nameAr, { metadata: { quantity: String(qty) } });
      await load(true);
      showToast(t.adminInventory.stockUpdated, 'success');
      setTarget(null);
    } catch (e) {
      showToast(e instanceof PermissionError ? t.states.forbiddenTitle : t.states.error, 'error');
    } finally {
      setSaving(false);
    }
  };

  const onSaveBulkSelected = async () => {
    const selectedRows = rows.filter((r) => selectedIds.has(r.id));
    if (selectedRows.length === 0) return;
    setBulkSaving(true);
    try {
      const items = selectedRows.map((r) => ({ productId: r.productId, variantId: r.variantId }));
      const res = await bulkUpdateStock({ items, quantity: bulkQty }, permissions);
      record('inventory_adjusted', 'inventory', `${items.length} items`, {
        metadata: { quantity: String(bulkQty), count: String(res.count) },
      });
      showToast(
        ar
          ? `تم تحديث مخزون ${items.length} منتج إلى ${bulkQty} قطعة بنجاح`
          : (t.adminInventory.bulkStockUpdated ?? 'Stock updated'),
        'success',
      );
      setBulkModalOpen(false);
      clearSelection();
      await load(true);
    } catch (e) {
      showToast(e instanceof PermissionError ? t.states.forbiddenTitle : t.states.error, 'error');
    } finally {
      setBulkSaving(false);
    }
  };

  const onSaveCategoryStock = async () => {
    if (!targetCategory || targetCategory === 'all') {
      showToast(t.adminInventory.categoryRequired ?? (ar ? 'يرجى اختيار القسم' : 'Please select a category'), 'error');
      return;
    }
    setCategorySaving(true);
    try {
      const res = await bulkUpdateStock({ categoryId: targetCategory, quantity: categoryQty }, permissions);
      const catName = categories.find((c) => c.id === targetCategory)?.nameAr ?? targetCategory;
      record('inventory_adjusted', 'inventory', catName, {
        metadata: { categoryId: targetCategory, quantity: String(categoryQty), count: String(res.count) },
      });
      showToast(
        ar
          ? `تم تحديث مخزون ${res.updatedProducts} منتج في قسم "${catName}" إلى ${categoryQty} قطعة بنجاح`
          : `Successfully updated stock for ${res.updatedProducts} products in category to ${categoryQty}`,
        'success',
      );
      setCategoryModalOpen(false);
      await load(true);
    } catch (e) {
      showToast(e instanceof PermissionError ? t.states.forbiddenTitle : t.states.error, 'error');
    } finally {
      setCategorySaving(false);
    }
  };

  const columns: DataColumn<Row>[] = [
    {
      key: 'select',
      header: (
        <div className="flex items-center justify-center">
          <Checkbox
            size="sm"
            checked={isAllSelected}
            indeterminate={isPartiallySelected}
            onChange={toggleSelectAll}
            disabled={loading || rows.length === 0}
          />
        </div>
      ),
      cell: (p) => (
        <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            size="sm"
            checked={selectedIds.has(p.id)}
            onChange={() => toggleSelectOne(p.id)}
          />
        </div>
      ),
      align: 'center',
      headerClassName: 'w-10 px-2',
      cellClassName: 'w-10 px-2',
      hideOnMobile: true,
    },
    {
      key: 'name', header: t.adminInventory.colName, hideOnMobile: true,
      cell: (p) => (
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.image} alt="" className="w-10 h-10 rounded-lg object-cover border border-ragab-ink-100 shrink-0" />
          <span className="font-bold text-ragab-ink-800">
            {p.nameAr}
            {p.variantName && <span className="ms-1.5 text-caption font-bold text-ragab-brand-700">— {p.variantName}</span>}
          </span>
        </div>
      ),
    },
    { key: 'cat', header: t.adminInventory.colCategory, cell: (p) => p.categoryNameAr, hideOnMobile: true },
    { key: 'stock', header: t.adminInventory.colStock, cell: (p) => <span className="font-bold text-ragab-ink-800">{p.stockQuantity} {t.adminInventory.units}</span>, align: 'center' },
    { key: 'status', header: t.adminInventory.colStatus, cell: (p) => <StatusPill tone={tone(p)}>{label(p)}</StatusPill> },
    {
      key: 'actions', header: '', align: 'end',
      cell: (p) => (
        <Button variant="outline" size="sm" onClick={() => openUpdate(p)} disabled={!hasPermission('inventory', 'edit')}>{t.adminInventory.updateStock}</Button>
      ),
    },
  ];

  const catOptions = [
    { value: 'all', label: t.adminInventory.allCategories ?? (ar ? 'كل الأقسام' : 'All categories') },
    ...categories.map((c) => ({ value: c.id, label: ar ? c.nameAr : c.nameEn })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-h2 text-ragab-ink-800">{t.adminInventory.title}</h2>
          <p className="text-body-sm text-ragab-ink-500 mt-0.5">{t.adminInventory.subtitle}</p>
        </div>
        <Can resource="inventory" action="edit">
          <Button
            variant="primary"
            leftIcon={<Layers className="w-4 h-4" />}
            onClick={() => {
              setTargetCategory(catFilter !== 'all' ? catFilter : (categories[0]?.id || ''));
              setCategoryModalOpen(true);
            }}
          >
            {t.adminInventory.bulkUpdateCategory ?? 'تحديد مخزون قسم كامل'}
          </Button>
        </Can>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_220px] gap-3 items-center">
        <Tabs variant="segmented" value={tab} onChange={(v) => setTab(v as 'all' | 'low')} items={[{ value: 'all', label: t.adminInventory.all }, { value: 'low', label: t.adminInventory.lowStockOnly, badge: tab === 'low' ? totalItems : undefined }]} />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.adminInventory.search} startIcon={<Search className="w-4 h-4" />} />
        <Select options={catOptions} value={catFilter} onChange={(e) => setCatFilter(e.target.value)} />
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 p-3.5 bg-ragab-brand-50 border border-ragab-brand-200 rounded-xl animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <span className="text-body-sm font-semibold text-ragab-brand-800">
              {ar ? `تم تحديد ${selectedIds.size} من أصل ${rows.length} منتج` : `${selectedIds.size} of ${rows.length} products selected`}
            </span>
            <button
              type="button"
              onClick={clearSelection}
              className="text-caption font-bold text-ragab-brand-700 hover:text-ragab-brand-900 underline underline-offset-2"
            >
              {ar ? 'إلغاء التحديد' : 'Clear selection'}
            </button>
          </div>
          <Can resource="inventory" action="edit">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<PackageCheck className="w-4 h-4" />}
              onClick={() => setBulkModalOpen(true)}
            >
              {ar ? `تعديل مخزون المحدد (${selectedIds.size})` : `${t.adminInventory.bulkUpdateStock} (${selectedIds.size})`}
            </Button>
          </Can>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-ragab-ink-400" /></div>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            keyField={(p) => p.id}
            rowClassName={(p) => (selectedIds.has(p.id) ? 'bg-ragab-brand-50/40' : undefined)}
            mobileTitle={(p) => (
              <div className="flex items-center gap-2.5">
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    size="sm"
                    checked={selectedIds.has(p.id)}
                    onChange={() => toggleSelectOne(p.id)}
                    className="shrink-0"
                  />
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image} alt="" className="w-9 h-9 rounded-lg object-cover border border-ragab-ink-100" />
                <span className="text-ragab-ink-800 font-medium">{p.nameAr}</span>
              </div>
            )}
            mobileMeta={(p) => <Button variant="outline" size="sm" onClick={() => openUpdate(p)} disabled={!hasPermission('inventory', 'edit')}>{t.adminInventory.updateStock}</Button>}
          />
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <Button variant="outline" onClick={() => load(false)} isLoading={loadingMore}>
                {t.common.showMore}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Drawer for updating single product stock */}
      <Drawer isOpen={!!target} onClose={() => setTarget(null)} title={t.adminInventory.updateStock} position="bottom" size="sm">
        {target && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={target.image} alt="" className="w-12 h-12 rounded-lg object-cover border border-ragab-ink-100" />
              <p className="font-bold text-ragab-ink-800">{target.nameAr}{target.variantName ? ` — ${target.variantName}` : ''}</p>
            </div>
            <FormField label={t.adminInventory.newQuantity}>
              <Input type="number" value={qty} onChange={(e) => setQty(Math.max(0, Number(e.target.value)))} startIcon={<PackageCheck className="w-4 h-4" />} />
            </FormField>
            <Button variant="primary" fullWidth onClick={onSave} isLoading={saving} leftIcon={<Check className="w-4 h-4" />}>{t.common.saveChanges}</Button>
          </div>
        )}
      </Drawer>

      {/* Modal for updating selected products stock */}
      <Modal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        title={t.adminInventory.bulkUpdateStockTitle ?? 'تعديل مخزون المنتجات المحددة'}
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-body-sm text-ragab-ink-600">
            {ar
              ? `سيتم تعيين عدد القطع الجديد لجميع المنتجات المحددة (${selectedIds.size} منتج).`
              : `The new stock quantity will be applied to all ${selectedIds.size} selected products.`}
          </p>
          <FormField label={t.adminInventory.newQuantity ?? 'الكمية الجديدة بالمخزون'}>
            <Input
              type="number"
              min={0}
              value={bulkQty}
              onChange={(e) => setBulkQty(Math.max(0, Number(e.target.value)))}
              startIcon={<PackageCheck className="w-4 h-4" />}
            />
          </FormField>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setBulkModalOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="primary"
              onClick={onSaveBulkSelected}
              isLoading={bulkSaving}
              leftIcon={<Check className="w-4 h-4" />}
            >
              {ar ? `تحديث مخزون (${selectedIds.size}) منتج` : t.common.saveChanges}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal for updating an entire category stock */}
      <Modal
        isOpen={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title={t.adminInventory.bulkUpdateCategoryTitle ?? 'تحديد مخزون قسم بالكامل'}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-3 bg-ragab-brand-50 border border-ragab-brand-200 rounded-lg text-body-sm text-ragab-brand-900">
            {ar
              ? 'سيتم تعيين عدد القطع الجديد لجميع المنتجات التابعة للقسم المختار دفعة واحدة.'
              : 'The new stock quantity will be applied to all products in the selected category at once.'}
          </div>
          <FormField label={t.adminInventory.selectCategory ?? 'اختر القسم'}>
            <Select
              options={categories.map((c) => ({ value: c.id, label: ar ? c.nameAr : c.nameEn }))}
              value={targetCategory}
              onChange={(e) => setTargetCategory(e.target.value)}
            />
          </FormField>
          <FormField label={t.adminInventory.newQuantity ?? 'الكمية الجديدة بالمخزون'}>
            <Input
              type="number"
              min={0}
              value={categoryQty}
              onChange={(e) => setCategoryQty(Math.max(0, Number(e.target.value)))}
              startIcon={<PackageCheck className="w-4 h-4" />}
            />
          </FormField>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCategoryModalOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="primary"
              onClick={onSaveCategoryStock}
              isLoading={categorySaving}
              leftIcon={<Check className="w-4 h-4" />}
            >
              {ar ? 'تحديث مخزون القسم' : t.common.saveChanges}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function InventoryAdminPage() {
  return (
    <RequirePermission resource="inventory" action="view">
      <InventoryInner />
    </RequirePermission>
  );
}
