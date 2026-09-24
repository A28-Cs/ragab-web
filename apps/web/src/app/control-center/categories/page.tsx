'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, MoreVertical, Pencil, Trash2, Loader2, Check, Star, FolderTree } from 'lucide-react';
import { cn } from '@ragab/utils';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../components/ui/Toast';
import { useAudit } from '../../../lib/useAudit';
import { getCategories, saveCategory, deleteCategory } from '../../../services/categoryService';
import { PermissionError } from '../../../lib/rbac';
import { ApiError } from '../../../lib/apiClient';
import { Category } from '../../../types';
import { RequirePermission } from '../../../components/auth/RequirePermission';
import { Can } from '../../../components/auth/Can';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { FormField } from '../../../components/ui/FormField';
import { Checkbox } from '../../../components/ui/Checkbox';
import { Select } from '../../../components/ui/Select';
import { ImageUpload } from '../../../components/ui/ImageUpload';
import { DataTable, DataColumn } from '../../../components/ui/DataTable';
import { DropdownMenu } from '../../../components/ui/DropdownMenu';
import { Badge } from '../../../components/ui/Badge';
import { Drawer } from '../../../components/ui/Drawer';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';

const blank: Category = { id: '', slug: '', nameAr: '', nameEn: '', iconName: 'Package', itemCount: 0, colorTheme: 'brand' };

function CategoriesInner() {
  const { t, language } = useLanguage();
  const ar = language === 'ar';
  const { permissions, hasPermission } = useAuth();
  const { showToast } = useToast();
  const record = useAudit();

  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<Category>(blank);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [nameError, setNameError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setItems(await getCategories()); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => c.nameAr.toLowerCase().includes(q) || c.nameEn.toLowerCase().includes(q));
  }, [items, query]);

  // Group each subcategory right under its parent (server order is otherwise flat), so
  // the hierarchy is legible without a dedicated tree widget.
  const grouped = useMemo(() => {
    const byParent = new Map<string, Category[]>();
    for (const c of filtered) {
      const key = c.parentId ?? '';
      byParent.set(key, [...(byParent.get(key) ?? []), c]);
    }
    const ordered: Category[] = [];
    for (const top of byParent.get('') ?? []) {
      ordered.push(top, ...(byParent.get(top.id) ?? []));
    }
    // A subcategory whose parent got filtered out by the search still needs to show up.
    const seen = new Set(ordered.map((c) => c.id));
    for (const c of filtered) if (!seen.has(c.id)) ordered.push(c);
    return ordered;
  }, [filtered]);

  const topLevelCategories = useMemo(() => items.filter((c) => !c.parentId), [items]);
  const hasChildren = (id: string) => items.some((c) => c.parentId === id);

  const openAdd = (parentId?: string) => { setForm({ ...blank, parentId }); setNameError(''); setDrawerOpen(true); };
  const openEdit = (c: Category) => { setForm(c); setNameError(''); setDrawerOpen(true); };
  const set = (patch: Partial<Category>) => setForm((f) => ({ ...f, ...patch }));

  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      // Surface the server's own rule (slug taken, category still has products, …).
      const message = e instanceof PermissionError ? t.states.forbiddenTitle : e instanceof ApiError ? (ar ? e.bilingual.ar : e.bilingual.en) : t.states.error;
      showToast(message, 'error');
    }
  };

  const onSave = async () => {
    if (!form.nameAr.trim()) { setNameError(t.adminCategories.nameRequired); return; }
    setSaving(true);
    await guard(async () => {
      await saveCategory(form, permissions);
      record('category_updated', 'categories', ar ? form.nameAr : form.nameEn || form.nameAr);
      await load();
      showToast(t.adminCategories.saved, 'success');
      setDrawerOpen(false);
    });
    setSaving(false);
  };

  const onDelete = () => {
    if (!deleteTarget) return;
    setBusy(true);
    guard(async () => {
      await deleteCategory(deleteTarget.id, permissions);
      record('category_updated', 'categories', deleteTarget.nameAr, { metadata: { action: 'deleted' } });
      await load();
      showToast(t.adminCategories.deleted, 'success');
    }).finally(() => { setBusy(false); setDeleteTarget(null); });
  };

  const columns: DataColumn<Category>[] = [
    {
      key: 'name', header: t.adminCategories.colName, hideOnMobile: true,
      cell: (c) => (
        <button onClick={() => openEdit(c)} className={cn('font-bold hover:text-ragab-brand-700 text-start inline-flex items-center gap-1', c.parentId ? 'ps-4 text-ragab-ink-600' : 'text-ragab-ink-800')}>
          {c.parentId && <span className="text-ragab-ink-400">↳</span>}
          {ar ? c.nameAr : c.nameEn}
        </button>
      ),
    },
    { key: 'items', header: t.adminCategories.colItems, cell: (c) => c.itemCount, align: 'center' },
    { key: 'featured', header: t.adminCategories.colFeatured, cell: (c) => c.featured ? <Badge variant="promo" size="sm">{t.adminCategories.featured}</Badge> : <span className="text-ragab-ink-400 text-caption">{t.adminCategories.notFeatured}</span> },
    {
      key: 'actions', header: t.admin.actions, align: 'end',
      cell: (c) => (
        <DropdownMenu
          trigger={<span className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-ragab-ink-500 hover:bg-ragab-ink-100"><MoreVertical className="w-4 h-4" /></span>}
          items={[
            { label: t.admin.edit, icon: <Pencil className="w-4 h-4" />, onClick: () => openEdit(c), disabled: !hasPermission('categories', 'edit') },
            // Subcategories can't nest further (two levels only), so this only makes sense on a top-level row.
            ...(!c.parentId
              ? [{ label: t.adminCategories.addSubcategory, icon: <FolderTree className="w-4 h-4" />, onClick: () => openAdd(c.id), disabled: !hasPermission('categories', 'create') }]
              : []),
            { label: t.admin.delete, icon: <Trash2 className="w-4 h-4" />, destructive: true, separatorBefore: true, onClick: () => setDeleteTarget(c), disabled: !hasPermission('categories', 'delete') },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-h2 text-ragab-ink-800">{t.adminCategories.title}</h2>
          <p className="text-body-sm text-ragab-ink-500 mt-0.5">{t.adminCategories.subtitle} · {filtered.length} {t.adminCategories.resultsCount}</p>
        </div>
        <Can resource="categories" action="create">
          <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />} onClick={() => openAdd()}>{t.adminCategories.newCategory}</Button>
        </Can>
      </div>

      <div className="max-w-sm">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.adminCategories.search} startIcon={<Search className="w-4 h-4" />} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-ragab-ink-400" /></div>
      ) : (
        <DataTable
          columns={columns}
          rows={grouped}
          keyField={(c) => c.id}
          mobileTitle={(c) => (
            <button onClick={() => openEdit(c)} className={cn('text-start inline-flex items-center gap-1', c.parentId ? 'text-ragab-ink-600' : 'text-ragab-ink-800')}>
              {c.parentId && <span className="text-ragab-ink-400">↳</span>}
              {ar ? c.nameAr : c.nameEn}
            </button>
          )}
        />
      )}

      <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} title={form.id ? t.adminCategories.editCategory : t.adminCategories.createCategory}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
            <FormField label={t.adminCategories.nameAr} error={nameError || undefined} required><Input value={form.nameAr} onChange={(e) => set({ nameAr: e.target.value })} invalid={!!nameError} /></FormField>
            <FormField label={t.adminCategories.nameEn}><Input dir="ltr" value={form.nameEn} onChange={(e) => set({ nameEn: e.target.value })} /></FormField>
          </div>
          {!form.id && form.parentId && (
            <p className="text-caption text-ragab-ink-500">
              {t.adminCategories.subcategoryOfPrefix}{' '}
              <strong className="text-ragab-ink-700">{(() => { const p = items.find((c) => c.id === form.parentId); return p ? (ar ? p.nameAr : p.nameEn) : ''; })()}</strong>
            </p>
          )}
          <FormField label={t.adminCategories.parentCategory}>
            <Select
              value={form.parentId ?? ''}
              onChange={(e) => set({ parentId: e.target.value || undefined })}
              disabled={!!form.id && hasChildren(form.id)}
              options={[
                { value: '', label: t.adminCategories.noParent },
                ...topLevelCategories.filter((c) => c.id !== form.id).map((c) => ({ value: c.id, label: ar ? c.nameAr : c.nameEn })),
              ]}
            />
            {!!form.id && hasChildren(form.id) && <p className="text-caption text-ragab-ink-500 mt-1">{t.adminCategories.cannotNestHasChildren}</p>}
          </FormField>
          <FormField label={t.adminCategories.image}><ImageUpload value={form.image} onChange={(v) => set({ image: v })} /></FormField>
          <FormField label={t.adminCategories.descriptionAr}><Textarea value={form.descriptionAr ?? ''} onChange={(e) => set({ descriptionAr: e.target.value })} /></FormField>
          <Checkbox checked={!!form.featured} onChange={(v) => set({ featured: v })} label={<span className="inline-flex items-center gap-1"><Star className="w-3.5 h-3.5" />{t.adminCategories.featuredToggle}</span>} size="sm" />
          <div className="flex items-center gap-2.5 pt-2">
            <Button variant="primary" fullWidth onClick={onSave} isLoading={saving} leftIcon={<Check className="w-4 h-4" />}>{t.common.saveChanges}</Button>
            <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={saving}>{t.common.cancel}</Button>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={onDelete} title={t.adminCategories.deleteTitle} description={t.adminCategories.deleteDesc} confirmLabel={t.admin.delete} destructive isLoading={busy} />
    </div>
  );
}

export default function CategoriesAdminPage() {
  return (
    <RequirePermission resource="categories" action="view">
      <CategoriesInner />
    </RequirePermission>
  );
}
