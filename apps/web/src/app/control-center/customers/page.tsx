'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search, MoreVertical, Eye, Ban, CheckCircle2, Loader2, Phone, MapPin, ShoppingBag, Undo2 } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../components/ui/Toast';
import { useAudit } from '../../../lib/useAudit';
import { getCustomers, setCustomerStatus } from '../../../services/customerService';
import { getOrders } from '../../../services/orderService';
import { PermissionError } from '../../../lib/rbac';
import { Customer, Order } from '../../../types';
import { RequirePermission } from '../../../components/auth/RequirePermission';
import { Input } from '../../../components/ui/Input';
import { DataTable, DataColumn } from '../../../components/ui/DataTable';
import { DropdownMenu } from '../../../components/ui/DropdownMenu';
import { StatusPill } from '../../../components/ui/StatusPill';
import { Avatar } from '../../../components/ui/Avatar';
import { Drawer } from '../../../components/ui/Drawer';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { ORDER_STATUS_TONE } from '../../../lib/orderStatus';

function CustomersInner() {
  const { t } = useLanguage();
  const { permissions, hasPermission } = useAuth();
  const { showToast } = useToast();
  const record = useAudit();

  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<Customer | null>(null);
  const [detailOrders, setDetailOrders] = useState<Order[]>([]);
  const [blockTarget, setBlockTarget] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setItems(await getCustomers()); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [items, query]);

  const openDetail = async (c: Customer) => {
    setDetail(c);
    setDetailOrders(await getOrders({ phone: c.phone }));
  };

  const guard = async (fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { showToast(e instanceof PermissionError ? t.states.forbiddenTitle : t.states.error, 'error'); }
  };

  const toggleBlock = (c: Customer) => {
    if (c.status === 'active') { setBlockTarget(c); return; }
    guard(async () => {
      await setCustomerStatus(c.id, 'active', permissions);
      record('customer_updated', 'customers', c.name, { metadata: { status: 'active' } });
      await load();
      showToast(t.adminCustomers.statusUpdated, 'success');
    });
  };

  const confirmBlock = () => {
    if (!blockTarget) return;
    setBusy(true);
    guard(async () => {
      await setCustomerStatus(blockTarget.id, 'blocked', permissions);
      record('customer_updated', 'customers', blockTarget.name, { metadata: { status: 'blocked' } });
      await load();
      showToast(t.adminCustomers.statusUpdated, 'success');
    }).finally(() => { setBusy(false); setBlockTarget(null); });
  };

  const columns: DataColumn<Customer>[] = [
    {
      key: 'name', header: t.adminCustomers.colName, hideOnMobile: true,
      cell: (c) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={c.name} size="sm" />
          <button onClick={() => openDetail(c)} className="font-bold text-ragab-ink-800 hover:text-ragab-brand-700 text-start">{c.name}</button>
        </div>
      ),
    },
    { key: 'phone', header: t.adminCustomers.colPhone, cell: (c) => <span dir="ltr" className="text-ragab-ink-600">{c.phone}</span> },
    { key: 'village', header: t.adminCustomers.colVillage, cell: (c) => c.village, hideOnMobile: true },
    { key: 'orders', header: t.adminCustomers.colOrders, cell: (c) => c.ordersCount, align: 'center' },
    { key: 'spent', header: t.adminCustomers.colSpent, cell: (c) => <span className="font-bold text-ragab-ink-800">{c.totalSpent} {t.common.egp}</span> },
    { key: 'status', header: t.adminCustomers.colStatus, cell: (c) => <StatusPill tone={c.status === 'active' ? 'success' : 'danger'}>{c.status === 'active' ? t.adminCustomers.active : t.adminCustomers.blocked}</StatusPill> },
    {
      key: 'actions', header: t.admin.actions, align: 'end',
      cell: (c) => (
        <DropdownMenu
          trigger={<span className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-ragab-ink-500 hover:bg-ragab-ink-100"><MoreVertical className="w-4 h-4" /></span>}
          items={[
            { label: t.admin.view, icon: <Eye className="w-4 h-4" />, onClick: () => openDetail(c) },
            {
              label: c.status === 'active' ? t.adminCustomers.block : t.adminCustomers.unblock,
              icon: c.status === 'active' ? <Ban className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />,
              destructive: c.status === 'active',
              onClick: () => toggleBlock(c),
              disabled: !hasPermission('customers', 'edit'),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-h2 text-ragab-ink-800">{t.adminCustomers.title}</h2>
        <p className="text-body-sm text-ragab-ink-500 mt-0.5">{t.adminCustomers.subtitle} · {filtered.length} {t.adminCustomers.resultsCount}</p>
      </div>

      <div className="max-w-sm">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.adminCustomers.search} startIcon={<Search className="w-4 h-4" />} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-ragab-ink-400" /></div>
      ) : (
        <DataTable columns={columns} rows={filtered} keyField={(c) => c.id}
          mobileTitle={(c) => (
            <div className="flex items-center gap-2.5">
              <Avatar name={c.name} size="sm" />
              <button onClick={() => openDetail(c)} className="text-ragab-ink-800 text-start">{c.name}</button>
            </div>
          )}
        />
      )}

      {/* Detail drawer */}
      <Drawer isOpen={!!detail} onClose={() => setDetail(null)} title={t.adminCustomers.profile}>
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={detail.name} size="lg" />
              <div>
                <p className="text-body font-bold text-ragab-ink-800">{detail.name}</p>
                <StatusPill tone={detail.status === 'active' ? 'success' : 'danger'}>{detail.status === 'active' ? t.adminCustomers.active : t.adminCustomers.blocked}</StatusPill>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Info icon={Phone} label={t.adminCustomers.colPhone} value={detail.phone} ltr />
              <Info icon={MapPin} label={t.adminCustomers.colVillage} value={detail.village} />
              <Info icon={ShoppingBag} label={t.adminCustomers.ordersCount} value={String(detail.ordersCount)} />
              <Info icon={ShoppingBag} label={t.adminCustomers.totalSpent} value={`${detail.totalSpent} ${t.common.egp}`} />
            </div>
            <div>
              <p className="text-body-sm font-bold text-ragab-ink-700 mb-2">{t.adminCustomers.recentOrders}</p>
              {detailOrders.length === 0 ? (
                <p className="text-caption text-ragab-ink-400">{t.account.noOrdersTitle}</p>
              ) : (
                <ul className="space-y-2">
                  {detailOrders.slice(0, 5).map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 rounded-lg border border-ragab-ink-100 p-2.5">
                      <div className="min-w-0">
                        <p className="text-body-sm font-bold text-ragab-ink-800" dir="ltr">{o.orderNumber}</p>
                        <p className="text-caption text-ragab-ink-500">{o.createdAt}</p>
                      </div>
                      <div className="text-end">
                        <StatusPill tone={ORDER_STATUS_TONE[o.status]}>{t.account.orderStatus[o.status]}</StatusPill>
                        <p className="text-body-sm font-bold text-ragab-ink-800 mt-1">{o.total} {t.common.egp}</p>
                        {o.refunded && (
                          <p className="text-caption font-bold text-ragab-danger mt-0.5 inline-flex items-center gap-1 justify-end" title={t.admin.refundedAmount}>
                            <Undo2 className="w-3 h-3" />
                            <span dir="ltr">-{o.total}</span> {t.common.egp}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmDialog isOpen={!!blockTarget} onClose={() => setBlockTarget(null)} onConfirm={confirmBlock} title={t.adminCustomers.blockTitle} description={t.adminCustomers.blockDesc} confirmLabel={t.adminCustomers.block} destructive isLoading={busy} />
    </div>
  );
}

const Info: React.FC<{ icon: React.ElementType; label: string; value: string; ltr?: boolean }> = ({ icon: Icon, label, value, ltr }) => (
  <div className="flex items-center gap-2.5 rounded-lg border border-ragab-ink-100 p-2.5">
    <Icon className="w-4 h-4 text-ragab-ink-400 shrink-0" />
    <div className="min-w-0">
      <p className="text-caption text-ragab-ink-500">{label}</p>
      <p className="text-body-sm font-semibold text-ragab-ink-800 truncate" dir={ltr ? 'ltr' : undefined}>{value}</p>
    </div>
  </div>
);

export default function CustomersAdminPage() {
  return (
    <RequirePermission resource="customers" action="view">
      <CustomersInner />
    </RequirePermission>
  );
}
