'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, MoreVertical, Pencil, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../components/ui/Toast';
import { useAudit } from '../../../lib/useAudit';
import { getAdminProductsPage, saveProduct, deleteProduct } from '../../../services/productService';
import { getCategories } from '../../../services/categoryService';
import { PermissionError } from '../../../lib/rbac';
import { Category, Product, ProductVariant } from '../../../types';
import { RequirePermission } from '../../../components/auth/RequirePermission';
import { Can } from '../../../components/auth/Can';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { DataTable, DataColumn } from '../../../components/ui/DataTable';
import { DropdownMenu } from '../../../components/ui/DropdownMenu';
import { StatusPill } from '../../../components/ui/StatusPill';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { CursorPager } from '../../../components/ui/CursorPager';
import { ProductWizard } from './ProductWizard';

const PAGE_SIZE = 20;

const blank: Product = {
  id: '', slug: '', nameAr: '', nameEn: '', categoryId: '', categoryNameAr: '', categoryNameEn: '',
  // No manual "unit" field in the wizard — single-unit products default to "per piece";
  // enabling packages (below) drives this from the default package instead.
  unitAr: 'قطعة', unitEn: 'pc', price: 0, inStock: true, stockQuantity: 0, image: '', images: [], descriptionAr: '',
};

function ProductsInner() {
  const { t, language } = useLanguage();
  const ar = language === 'ar';
  const { permissions, hasPermission } = useAuth();
  const { showToast } = useToast();
  const record = useAudit();

  const [rows, setRows] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);
  const [form, setForm] = useState<Product>(blank);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [nameError, setNameError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  // cursors[i] = cursor that fetches page i+1 (page 1 has none). Reset with the filters.
  const cursors = useRef<(string | undefined)[]>([undefined]);

  useEffect(() => {
    getCategories().then(setCategories);
  }, []);

  // Debounce typing → one request per pause, not per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    cursors.current = [undefined];
    setPage(1);
  }, [q, catFilter]);

  const load = useCallback(async () => {
    const cursor = cursors.current[page - 1];
    if (page > 1 && cursor === undefined) return; // filters just changed; page resets to 1
    setLoading(true);
    try {
      const res = await getAdminProductsPage({ categoryId: catFilter === 'all' ? undefined : catFilter, searchQuery: q || undefined, cursor, limit: PAGE_SIZE });
      setRows(res.items);
      setTotal(res.total ?? res.items.length);
      setHasMore(res.hasMore);
      if (res.nextCursor) cursors.current[page] = res.nextCursor;
    } finally {
      setLoading(false);
    }
  }, [page, q, catFilter]);

  useEffect(() => {
    load();
  }, [load, tick]);

  const reload = () => setTick((n) => n + 1);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openAdd = () => { setForm(blank); setNameError(''); setDrawerOpen(true); };
  const openEdit = (p: Product) => {
    setForm({ ...p, images: p.images ?? [] }); setNameError(''); setDrawerOpen(true);
  };
  const set = (patch: Partial<Product>) => setForm((f) => ({ ...f, ...patch }));

  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      openAdd();
    }
  }, [searchParams]);

  const guard = async (fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { showToast(e instanceof PermissionError ? t.states.forbiddenTitle : t.states.error, 'error'); }
  };

  const onSave = async (finalProduct: Product) => {
    if (!finalProduct.nameAr.trim()) { setNameError(t.adminProducts.nameRequired); return; }
    const cat = categories.find((c) => c.id === finalProduct.categoryId) ?? categories[0];
    setSaving(true);
    await guard(async () => {
      const saved = await saveProduct(
        { ...finalProduct, categoryId: cat?.id ?? '', categoryNameAr: cat?.nameAr ?? '', categoryNameEn: cat?.nameEn ?? '' },
        permissions
      );
      record('product_updated', 'products', ar ? saved.nameAr : saved.nameEn || saved.nameAr);
      reload();
      showToast(t.adminProducts.saved, 'success');
      setDrawerOpen(false);
    });
    setSaving(false);
  };

  const onDelete = () => {
    if (!deleteTarget) return;
    setBusy(true);
    guard(async () => {
      await deleteProduct(deleteTarget.id, permissions);
      record('product_updated', 'products', deleteTarget.nameAr, { metadata: { action: 'deleted' } });
      reload();
      showToast(t.adminProducts.deleted, 'success');
    }).finally(() => { setBusy(false); setDeleteTarget(null); });
  };

  const stockTone = (p: Product) => (!p.inStock || p.stockQuantity === 0 ? 'danger' : p.stockQuantity <= (p.lowStockThreshold ?? 5) ? 'warning' : 'success');

  const columns: DataColumn<Product>[] = [
    {
      key: 'name', header: t.adminProducts.colName, hideOnMobile: true,
      cell: (p) => (
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.image} alt="" className="w-10 h-10 rounded-lg object-cover border border-ragab-ink-100 shrink-0" />
          <button onClick={() => openEdit(p)} className="font-bold text-ragab-ink-800 hover:text-ragab-brand-700 text-start">{p.nameAr}</button>
        </div>
      ),
    },
    { key: 'cat', header: t.adminProducts.colCategory, cell: (p) => p.categoryNameAr, hideOnMobile: true },
    {
      key: 'price', header: t.adminProducts.colPrice,
      cell: (p) => {
        const units = (p.variants ?? []).filter((v) => v.isActive).length;
        return (
          <span className="font-bold text-ragab-ink-800">
            {p.price} {t.common.egp}
            {units > 1 && <span className="ms-1.5 text-[11px] font-bold text-ragab-brand-700 bg-ragab-brand-100 rounded-full px-1.5 py-0.5">{units} {t.adminProducts.variantsCount}</span>}
          </span>
        );
      },
    },
    { key: 'stock', header: t.adminProducts.colStock, cell: (p) => p.stockQuantity, align: 'center' },
    { key: 'status', header: t.adminProducts.colStatus, cell: (p) => <StatusPill tone={stockTone(p)}>{p.inStock && p.stockQuantity > 0 ? t.adminProducts.inStock : t.adminProducts.outOfStock}</StatusPill> },
    {
      key: 'actions', header: t.admin.actions, align: 'end',
      cell: (p) => (
        <DropdownMenu
          trigger={<span className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-ragab-ink-500 hover:bg-ragab-ink-100"><MoreVertical className="w-4 h-4" /></span>}
          items={[
            { label: t.admin.edit, icon: <Pencil className="w-4 h-4" />, onClick: () => openEdit(p), disabled: !hasPermission('products', 'edit') },
            { label: t.admin.delete, icon: <Trash2 className="w-4 h-4" />, destructive: true, separatorBefore: true, onClick: () => setDeleteTarget(p), disabled: !hasPermission('products', 'delete') },
          ]}
        />
      ),
    },
  ];

  const catOptions = [{ value: 'all', label: t.adminProducts.allCategories }, ...categories.map((c) => ({ value: c.id, label: ar ? c.nameAr : c.nameEn }))];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-h2 text-ragab-ink-800">{t.adminProducts.title}</h2>
          <p className="text-body-sm text-ragab-ink-500 mt-0.5">{t.adminProducts.subtitle} · {total} {t.adminProducts.resultsCount}</p>
        </div>
        <Can resource="products" action="create">
          <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />} onClick={openAdd}>{t.adminProducts.newProduct}</Button>
        </Can>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-3">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.adminProducts.search} startIcon={<Search className="w-4 h-4" />} />
        <Select options={catOptions} value={catFilter} onChange={(e) => setCatFilter(e.target.value)} />
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-ragab-ink-400" /></div>
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={loading}>
          <DataTable columns={columns} rows={rows} keyField={(p) => p.id}
            mobileTitle={(p) => (
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image} alt="" className="w-9 h-9 rounded-lg object-cover border border-ragab-ink-100" />
                <button onClick={() => openEdit(p)} className="text-ragab-ink-800 text-start">{p.nameAr}</button>
              </div>
            )}
          />
          <CursorPager
            className="mt-3"
            page={page}
            pageCount={pageCount}
            hasMore={hasMore}
            disabled={loading}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        </div>
      )}

      <ProductWizard
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        isEdit={!!form.id}
        form={form}
        set={set}
        categories={categories}
        nameError={nameError}
        saving={saving}
        onSave={onSave}
      />

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={onDelete} title={t.adminProducts.deleteTitle} description={t.adminProducts.deleteDesc} confirmLabel={t.admin.delete} destructive isLoading={busy} />
    </div>
  );
}

export default function ProductsAdminPage() {
  return (
    <RequirePermission resource="products" action="view">
      <React.Suspense fallback={null}>
        <ProductsInner />
      </React.Suspense>
    </RequirePermission>
  );
}
