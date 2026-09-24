'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search, Loader2, Check, PackageCheck } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../components/ui/Toast';
import { useAudit } from '../../../lib/useAudit';
import { getAdminProductsPage, updateStock } from '../../../services/productService';

/** One table row per stocked UNIT: a multi-unit product expands into one row per active variant (0007). */
type Row = Product & { productId: string; variantId?: string; variantName?: string };
import { PermissionError } from '../../../lib/rbac';
import { Product } from '../../../types';
import { RequirePermission } from '../../../components/auth/RequirePermission';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Tabs } from '../../../components/ui/Tabs';
import { FormField } from '../../../components/ui/FormField';
import { DataTable, DataColumn } from '../../../components/ui/DataTable';
import { StatusPill } from '../../../components/ui/StatusPill';
import { Drawer } from '../../../components/ui/Drawer';

const LOW = 5;

function InventoryInner() {
  const { t } = useLanguage();
  const { permissions, hasPermission } = useAuth();
  const { showToast } = useToast();
  const record = useAudit();

  const [products, setProducts] = useState<Product[]>([]);
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

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handler);
  }, [query]);

  const load = async (reset = true) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await getAdminProductsPage({
        searchQuery: debouncedQuery || undefined,
        lowStockOnly: tab === 'low' ? true : undefined,
        cursor: reset ? undefined : (nextCursor ?? undefined),
        limit: 20
      });
      setProducts(prev => reset ? res.items : [...prev, ...res.items]);
      setNextCursor(res.nextCursor ?? null);
      setHasMore(res.hasMore);
      if (res.total !== undefined) setTotalItems(res.total);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => { load(true); }, [debouncedQuery, tab]);

  const rows = useMemo<Row[]>(
    () =>
      products.flatMap((p) => {
        const active = (p.variants ?? []).filter((v) => v.isActive);
        if (active.length <= 1) return [{ ...p, productId: p.id, variantId: active[0]?.id }];
        return active.map((v) => ({ ...p, id: `${p.id}::${v.id}`, productId: p.id, variantId: v.id, variantName: v.nameAr, stockQuantity: v.stockQuantity }));
      }),
    [products],
  );

  const tone = (p: Product) => (p.stockQuantity === 0 ? 'danger' : p.stockQuantity <= (p.lowStockThreshold ?? LOW) ? 'warning' : 'success');
  const label = (p: Product) => (p.stockQuantity === 0 ? t.adminInventory.out : p.stockQuantity <= (p.lowStockThreshold ?? LOW) ? t.adminInventory.low : t.adminInventory.inStock);

  const openUpdate = (p: Row) => { setTarget(p); setQty(p.stockQuantity); };

  const onSave = async () => {
    if (!target) return;
    setSaving(true);
    try {
      await updateStock(target.productId, qty, permissions, target.variantId);
      record('inventory_adjusted', 'inventory', target.nameAr, { metadata: { quantity: String(qty) } });
      await load();
      showToast(t.adminInventory.stockUpdated, 'success');
      setTarget(null);
    } catch (e) {
      showToast(e instanceof PermissionError ? t.states.forbiddenTitle : t.states.error, 'error');
    } finally {
      setSaving(false);
    }
  };

  const columns: DataColumn<Row>[] = [
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-h2 text-ragab-ink-800">{t.adminInventory.title}</h2>
        <p className="text-body-sm text-ragab-ink-500 mt-0.5">{t.adminInventory.subtitle}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <Tabs variant="segmented" value={tab} onChange={(v) => setTab(v as 'all' | 'low')} items={[{ value: 'all', label: t.adminInventory.all }, { value: 'low', label: t.adminInventory.lowStockOnly, badge: tab === 'low' ? totalItems : undefined }]} />
        <div className="sm:max-w-xs sm:ms-auto w-full">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.adminInventory.search} startIcon={<Search className="w-4 h-4" />} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-ragab-ink-400" /></div>
      ) : (
        <>
          <DataTable columns={columns} rows={rows} keyField={(p) => p.id}
            mobileTitle={(p) => (
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image} alt="" className="w-9 h-9 rounded-lg object-cover border border-ragab-ink-100" />
                <span className="text-ragab-ink-800">{p.nameAr}</span>
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
