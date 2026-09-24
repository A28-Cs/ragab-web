'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, MoreVertical, Pencil, Trash2, Loader2, Check, Tag } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../components/ui/Toast';
import { getPromotions, savePromotion, deletePromotion } from '../../../services/promotionService';
import { getCategories } from '../../../services/categoryService';
import { getProductsByIds, getAdminProductsPage } from '../../../services/productService';
import { PermissionError } from '../../../lib/rbac';
import { ApiError } from '../../../lib/apiClient';
import { Category, Product, Promotion } from '../../../types';
import { RequirePermission } from '../../../components/auth/RequirePermission';
import { Can } from '../../../components/auth/Can';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { FormField } from '../../../components/ui/FormField';
import { Checkbox } from '../../../components/ui/Checkbox';
import { ImageUpload } from '../../../components/ui/ImageUpload';
import { Tabs } from '../../../components/ui/Tabs';
import { DataTable, DataColumn } from '../../../components/ui/DataTable';
import { DropdownMenu } from '../../../components/ui/DropdownMenu';
import { Badge } from '../../../components/ui/Badge';
import { StatusPill } from '../../../components/ui/StatusPill';
import { Drawer } from '../../../components/ui/Drawer';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';

const blank: Promotion = {
  id: '', kind: 'automatic', type: 'percentage', value: 10, minOrder: 0, scope: 'cart', productIds: [], categoryIds: [],
  isActive: true, perUserLimit: 0, usageCount: 0, showBanner: false,
  titleAr: '', titleEn: '', subtitleAr: '', subtitleEn: '', badgeAr: '', badgeEn: '', displayBadgeAr: '', displayBadgeEn: '',
  theme: 'gold', sortOrder: 0, createdAt: '',
};
const THEMES = ['amber', 'gold', 'sunset'] as const;
const multiSelectClass = 'w-full min-h-[8rem] rounded-lg border border-ragab-ink-200 bg-white p-2 text-body-sm text-ragab-ink-800 focus-ring';

/** The promotion engine's admin: one rule = activation + discount + scope + validity + (optional) banner. */
function PromotionsInner() {
  const { t, language } = useLanguage();
  const ar = language === 'ar';
  const { permissions, hasPermission } = useAuth();
  const { showToast } = useToast();

  const [items, setItems] = useState<Promotion[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'all' | 'automatic' | 'code'>('all');
  const [form, setForm] = useState<Promotion>(blank);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([getPromotions(), getCategories()]);
      const allProductIds = Array.from(new Set(p.flatMap(x => [...x.productIds, x.giftProductId]).filter(Boolean)));
      const pr = await getProductsByIds(allProductIds as string[]);
      setItems(p); setCategories(c); setProducts(pr);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const timer = setTimeout(() => {
      getAdminProductsPage({ searchQuery: productSearch, limit: 50 }).then(res => {
         setSearchResults(res.items);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearch, drawerOpen]);

  const name = (p: Promotion) => (ar ? p.titleAr || p.titleEn : p.titleEn || p.titleAr) || p.code || p.id;
  const catName = (id: string) => { const c = categories.find((x) => x.id === id); return c ? (ar ? c.nameAr : c.nameEn) : id; };
  const prodName = (id: string) => { const p = [...products, ...searchResults].find((x) => x.id === id); return p ? (ar ? p.nameAr : p.nameEn || p.nameAr) : id; };

  /** «خصم 15% · الألبان» — the rule in one line, derived exactly like the storefront badge. */
  const ruleSummary = (p: Promotion) => {
    const what = p.type === 'free_delivery' ? t.adminPromotions.summaryFreeDelivery : p.type === 'free_gift' ? `${t.adminPromotions.summaryGift}: ${p.giftProductId ? prodName(p.giftProductId) : '—'}` : (ar ? p.displayBadgeAr : p.displayBadgeEn);
    const where = p.scope === 'cart' ? t.adminPromotions.everything : p.scope === 'category' ? p.categoryIds.map(catName).join('، ') : p.productIds.map(prodName).join('، ');
    const min = p.minOrder > 0 ? ` · ≥ ${p.minOrder} ${t.common.egp}` : '';
    return `${what} · ${where}${min}`;
  };
  const status = (p: Promotion): { tone: 'success' | 'neutral' | 'warning' | 'danger'; label: string } => {
    if (!p.isActive) return { tone: 'neutral', label: t.adminPromotions.statusInactive };
    if (p.expiresAt && new Date(p.expiresAt) <= new Date()) return { tone: 'danger', label: t.adminPromotions.statusExpired };
    if (p.usageLimit && p.usageCount >= p.usageLimit) return { tone: 'warning', label: t.adminPromotions.statusExhausted };
    return { tone: 'success', label: t.adminPromotions.statusActive };
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((p) => {
      if (tab !== 'all' && p.kind !== tab) return false;
      if (!q) return true;
      return [p.titleAr, p.titleEn, p.code ?? ''].some((s) => s.toLowerCase().includes(q));
    });
  }, [items, query, tab]);

  const openAdd = () => { setForm(blank); setError(''); setDrawerOpen(true); };
  const openEdit = (p: Promotion) => { setForm(p); setError(''); setDrawerOpen(true); };
  const set = (patch: Partial<Promotion>) => setForm((f) => ({ ...f, ...patch }));

  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      const message = e instanceof PermissionError ? t.states.forbiddenTitle : e instanceof ApiError ? (ar ? e.bilingual.ar : e.bilingual.en) : t.states.error;
      showToast(message, 'error');
    }
  };

  const validate = (): string => {
    if (form.kind === 'code' && !form.code?.trim()) return t.adminPromotions.codeRequired;
    if ((form.type === 'percentage' && (form.value <= 0 || form.value > 100)) || (form.type === 'fixed' && form.value <= 0)) return t.adminPromotions.valueRequired;
    if (form.type === 'free_gift' && !form.giftProductId) return t.adminPromotions.giftRequired;
    if (form.scope === 'category' && form.categoryIds.length === 0) return t.adminPromotions.pickRequired;
    if (form.scope === 'product' && form.productIds.length === 0) return t.adminPromotions.pickRequired;
    if (form.showBanner && !form.titleAr.trim()) return t.adminPromotions.titleRequired;
    return '';
  };

  const onSave = async () => {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setSaving(true);
    await guard(async () => {
      await savePromotion(form, permissions);
      await load();
      showToast(t.adminPromotions.saved, 'success');
      setDrawerOpen(false);
    });
    setSaving(false);
  };

  const onDelete = () => {
    if (!deleteTarget) return;
    setBusy(true);
    guard(async () => {
      const res = await deletePromotion(deleteTarget.id, permissions);
      await load();
      showToast(res.deleted ? t.adminPromotions.deleted : t.adminPromotions.deactivated, 'success');
    }).finally(() => { setBusy(false); setDeleteTarget(null); });
  };

  const columns: DataColumn<Promotion>[] = [
    {
      key: 'title', header: t.adminPromotions.colTitle, hideOnMobile: true,
      cell: (p) => (
        <button onClick={() => openEdit(p)} className="text-start">
          <span className="font-bold text-ragab-ink-800 hover:text-ragab-brand-700">{name(p)}</span>
          {p.kind === 'code' && <span className="ms-2 inline-flex items-center gap-1 rounded-md bg-ragab-ink-100 px-1.5 py-0.5 text-[11px] font-bold text-ragab-ink-700" dir="ltr"><Tag className="w-3 h-3" />{p.code}</span>}
        </button>
      ),
    },
    { key: 'rule', header: t.adminPromotions.colRule, cell: (p) => <span className="text-body-sm text-ragab-ink-700">{ruleSummary(p)}</span> },
    { key: 'status', header: t.adminPromotions.colStatus, cell: (p) => { const s = status(p); return <StatusPill tone={s.tone}>{s.label}</StatusPill>; } },
    { key: 'used', header: t.adminPromotions.usedTimes, cell: (p) => <span dir="ltr">{p.usageCount}{p.usageLimit ? ` / ${p.usageLimit}` : ''}</span>, align: 'center', hideOnMobile: true },
    { key: 'banner', header: t.adminPromotions.colBanner, cell: (p) => (p.showBanner ? <Badge variant="promo" size="sm">{ar ? p.displayBadgeAr || '✓' : p.displayBadgeEn || '✓'}</Badge> : <span className="text-ragab-ink-400">—</span>), hideOnMobile: true },
    {
      key: 'actions', header: t.admin.actions, align: 'end',
      cell: (p) => (
        <DropdownMenu
          trigger={<span className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-ragab-ink-500 hover:bg-ragab-ink-100"><MoreVertical className="w-4 h-4" /></span>}
          items={[
            { label: t.admin.edit, icon: <Pencil className="w-4 h-4" />, onClick: () => openEdit(p), disabled: !hasPermission('promotions', 'edit') },
            { label: t.admin.delete, icon: <Trash2 className="w-4 h-4" />, destructive: true, separatorBefore: true, onClick: () => setDeleteTarget(p), disabled: !hasPermission('promotions', 'delete') },
          ]}
        />
      ),
    },
  ];

  const catOptions = categories.map((c) => ({ value: c.id, label: ar ? c.nameAr : c.nameEn }));
  const allAvailableProducts = Array.from(new Map([...products, ...searchResults].map(p => [p.id, p])).values());
  const productOptions = allAvailableProducts.map((p) => ({ value: p.id, label: ar ? p.nameAr : p.nameEn || p.nameAr }));
  const selectedValues = (e: React.ChangeEvent<HTMLSelectElement>) => Array.from(e.target.selectedOptions).map((o) => o.value);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-h2 text-ragab-ink-800">{t.adminPromotions.title}</h2>
          <p className="text-body-sm text-ragab-ink-500 mt-0.5">{t.adminPromotions.engineSubtitle}</p>
        </div>
        <Can resource="promotions" action="create">
          <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />} onClick={openAdd}>{t.adminPromotions.newPromo}</Button>
        </Can>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <Tabs variant="segmented" value={tab} onChange={(v) => setTab(v as typeof tab)} items={[{ value: 'all', label: t.adminPromotions.tabAll }, { value: 'automatic', label: t.adminPromotions.tabAutomatic }, { value: 'code', label: t.adminPromotions.tabCode }]} />
        <div className="sm:max-w-xs sm:ms-auto w-full">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.adminPromotions.search} startIcon={<Search className="w-4 h-4" />} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-ragab-ink-400" /></div>
      ) : (
        <DataTable columns={columns} rows={filtered} keyField={(p) => p.id} mobileTitle={(p) => <button onClick={() => openEdit(p)} className="text-ragab-ink-800 text-start">{name(p)} — {ruleSummary(p)}</button>} />
      )}

      <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} title={form.id ? t.adminPromotions.editPromo : t.adminPromotions.createPromo} size="lg">
        <div className="space-y-5">
          {error && <p role="alert" className="text-body-sm font-bold text-ragab-danger bg-ragab-danger-soft rounded-lg px-3 py-2">{error}</p>}

          {/* 1. Activation */}
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
            <FormField label={t.adminPromotions.kind}>
              <Select options={[{ value: 'automatic', label: t.adminPromotions.kindAutomatic }, { value: 'code', label: t.adminPromotions.kindCode }]} value={form.kind} onChange={(e) => set({ kind: e.target.value as Promotion['kind'], perUserLimit: e.target.value === 'code' ? 1 : 0 })} />
            </FormField>
            {form.kind === 'code' && (
              <FormField label={t.adminPromotions.code} required><Input dir="ltr" value={form.code ?? ''} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="WELCOME10" /></FormField>
            )}
          </div>

          {/* 2. Discount */}
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
            <FormField label={t.adminPromotions.ruleType}>
              <Select
                options={[
                  { value: 'percentage', label: t.adminPromotions.typePercentage },
                  { value: 'fixed', label: t.adminPromotions.typeFixed },
                  { value: 'free_delivery', label: t.adminPromotions.typeFreeDelivery },
                  { value: 'free_gift', label: t.adminPromotions.typeFreeGift },
                ]}
                value={form.type}
                onChange={(e) => set({ type: e.target.value as Promotion['type'] })}
              />
            </FormField>
            {(form.type === 'percentage' || form.type === 'fixed') && (
              <FormField label={form.type === 'percentage' ? t.adminPromotions.valuePercent : t.adminPromotions.valueFixed} required>
                <Input type="number" dir="ltr" min={0} step={form.type === 'percentage' ? 1 : 0.5} value={form.value} onChange={(e) => set({ value: Number(e.target.value) })} />
              </FormField>
            )}
            {form.type === 'free_gift' && (
              <FormField label={t.adminPromotions.giftProduct} required>
                <Input placeholder={t.adminPromotions.search} value={productSearch} onChange={e => setProductSearch(e.target.value)} className="mb-2" />
                <Select options={[{value: '', label: t.adminPromotions.giftProduct}, ...productOptions]} value={form.giftProductId ?? ''} onChange={(e) => set({ giftProductId: e.target.value || undefined })} />
              </FormField>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t.adminPromotions.minOrder}><Input type="number" dir="ltr" min={0} value={form.minOrder} onChange={(e) => set({ minOrder: Number(e.target.value) })} /></FormField>
            {(form.type === 'percentage' || form.type === 'fixed') && (
              <FormField label={t.adminPromotions.maxDiscount}><Input type="number" dir="ltr" min={0} value={form.maxDiscount ?? ''} onChange={(e) => set({ maxDiscount: e.target.value ? Number(e.target.value) : undefined })} /></FormField>
            )}
          </div>

          {/* 3. Scope */}
          <FormField label={t.adminPromotions.scope}>
            <Select options={[{ value: 'cart', label: t.adminPromotions.scopeCart }, { value: 'category', label: t.adminPromotions.scopeCategory }, { value: 'product', label: t.adminPromotions.scopeProduct }]} value={form.scope} onChange={(e) => set({ scope: e.target.value as Promotion['scope'] })} />
          </FormField>
          {form.scope === 'category' && (
            <FormField label={t.adminPromotions.pickCategories} required>
              <select multiple value={form.categoryIds} onChange={(e) => set({ categoryIds: selectedValues(e) })} className={multiSelectClass} aria-label={t.adminPromotions.pickCategories}>
                {catOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p className="text-caption text-ragab-ink-500 mt-1">{t.adminPromotions.pickHint}</p>
            </FormField>
          )}
          {form.scope === 'product' && (
            <FormField label={t.adminPromotions.pickProducts} required>
              <Input placeholder={t.adminPromotions.search} value={productSearch} onChange={e => setProductSearch(e.target.value)} className="mb-2" />
              <select multiple value={form.productIds} onChange={(e) => set({ productIds: selectedValues(e) })} className={multiSelectClass} aria-label={t.adminPromotions.pickProducts}>
                {productOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p className="text-caption text-ragab-ink-500 mt-1">{t.adminPromotions.pickHint}</p>
            </FormField>
          )}

          {/* 4. Validity & limits */}
          <div className="rounded-xl border border-ragab-ink-200 p-3 space-y-3">
            <p className="text-label text-ragab-ink-700">{t.adminPromotions.validity}</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t.adminPromotions.startsAt}><Input type="date" dir="ltr" value={form.startsAt?.slice(0, 10) ?? ''} onChange={(e) => set({ startsAt: e.target.value || undefined })} /></FormField>
              <FormField label={t.adminPromotions.expiresAt}><Input type="date" dir="ltr" value={form.expiresAt?.slice(0, 10) ?? ''} onChange={(e) => set({ expiresAt: e.target.value || undefined })} /></FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t.adminPromotions.usageLimit}><Input type="number" dir="ltr" min={1} value={form.usageLimit ?? ''} onChange={(e) => set({ usageLimit: e.target.value ? Number(e.target.value) : undefined })} /></FormField>
              <FormField label={t.adminPromotions.perUserLimit}><Input type="number" dir="ltr" min={0} value={form.perUserLimit} onChange={(e) => set({ perUserLimit: Number(e.target.value) })} /></FormField>
            </div>
            <Checkbox checked={form.isActive} onChange={(v) => set({ isActive: v })} label={t.adminPromotions.active} size="sm" />
          </div>

          {/* 5. Banner */}
          <div className="rounded-xl border border-ragab-ink-200 p-3 space-y-3">
            <Checkbox checked={form.showBanner} onChange={(v) => set({ showBanner: v })} label={t.adminPromotions.showBanner} size="sm" />
            <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
              <FormField label={t.adminPromotions.titleAr} required={form.showBanner}><Input value={form.titleAr} onChange={(e) => set({ titleAr: e.target.value })} /></FormField>
              <FormField label={t.adminPromotions.titleEn}><Input dir="ltr" value={form.titleEn} onChange={(e) => set({ titleEn: e.target.value })} /></FormField>
            </div>
            {form.showBanner && (
              <>
                <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
                  <FormField label={t.adminPromotions.subtitleAr}><Textarea rows={2} value={form.subtitleAr} onChange={(e) => set({ subtitleAr: e.target.value })} /></FormField>
                  <FormField label={t.adminPromotions.subtitleEn}><Textarea rows={2} dir="ltr" value={form.subtitleEn} onChange={(e) => set({ subtitleEn: e.target.value })} /></FormField>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label={t.adminPromotions.badgeAr}><Input value={form.badgeAr} onChange={(e) => set({ badgeAr: e.target.value })} placeholder={form.displayBadgeAr} /></FormField>
                  <FormField label={t.adminPromotions.badgeEn}><Input dir="ltr" value={form.badgeEn} onChange={(e) => set({ badgeEn: e.target.value })} placeholder={form.displayBadgeEn} /></FormField>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label={t.adminPromotions.theme}><Select options={THEMES.map((th) => ({ value: th, label: th }))} value={form.theme} onChange={(e) => set({ theme: e.target.value as Promotion['theme'] })} /></FormField>
                  <FormField label={t.adminPromotions.sortOrder}><Input type="number" dir="ltr" min={0} value={form.sortOrder} onChange={(e) => set({ sortOrder: Number(e.target.value) })} /></FormField>
                </div>
                <FormField label={t.adminPromotions.image}><ImageUpload value={form.imageUrl} onChange={(v) => set({ imageUrl: v })} /></FormField>
              </>
            )}
          </div>

          <div className="flex items-center gap-2.5 pt-2">
            <Button variant="primary" fullWidth onClick={onSave} isLoading={saving} leftIcon={<Check className="w-4 h-4" />}>{t.common.saveChanges}</Button>
            <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={saving}>{t.common.cancel}</Button>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={onDelete} title={t.adminPromotions.deleteTitle} description={t.adminPromotions.deleteDesc} confirmLabel={t.admin.delete} destructive isLoading={busy} />
    </div>
  );
}

export default function PromotionsAdminPage() {
  return (
    <RequirePermission resource="promotions" action="view">
      <PromotionsInner />
    </RequirePermission>
  );
}
