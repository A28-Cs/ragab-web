'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Loader2, CheckCircle2, XCircle, Undo2, Wallet, Phone, Mail, ExternalLink } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { getAuditLog } from '../../../services/auditService';
import { getStaff } from '../../../services/staffService';
import { RESOURCES } from '../../../lib/rbac';
import { AuditLogEntry, Resource, StaffUser } from '../../../types';
import { RequirePermission } from '../../../components/auth/RequirePermission';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { DataTable, DataColumn } from '../../../components/ui/DataTable';
import { StatusPill } from '../../../components/ui/StatusPill';
import { Avatar } from '../../../components/ui/Avatar';
import { Drawer } from '../../../components/ui/Drawer';
import { AUDIT_ACTION_KEY } from '../../../lib/audit';

/** Where a resource id can be opened. Only pages that exist — never a guessed URL. */
function resourceHref(e: AuditLogEntry): string | null {
  if (!e.resourceId) return null;
  if (e.resource === 'orders') return `/control-center/orders/${encodeURIComponent(e.resourceId)}`;
  return null;
}

function AuditLogInner() {
  const { t, language } = useLanguage();
  const ar = language === 'ar';
  const [log, setLog] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<'all' | 'success' | 'failure'>('all');
  const [resource, setResource] = useState<'all' | Resource>('all');
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);
  // Actor contact comes from the staff directory (users:view). Loaded once, on the first
  // open; a 403 simply hides the contact block instead of breaking the drawer.
  const [staff, setStaff] = useState<Record<string, StaffUser> | null>(null);
  const [staffDenied, setStaffDenied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await getAuditLog();
        if (alive) setLog(data);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!selected || staff || staffDenied) return;
    let alive = true;
    (async () => {
      try {
        const list = await getStaff();
        if (alive) setStaff(Object.fromEntries(list.map((s) => [s.id, s])));
      } catch {
        if (alive) setStaffDenied(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selected, staff, staffDenied]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return log.filter((e) => {
      if (result !== 'all' && e.result !== result) return false;
      if (resource !== 'all' && e.resource !== resource) return false;
      if (q && !e.actorName.toLowerCase().includes(q) && !(e.target ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [log, query, result, resource]);

  const resourceOptions = [
    { value: 'all', label: ar ? 'كل الموارد' : 'All resources' },
    ...RESOURCES.map((r) => ({ value: r.key, label: ar ? r.nameAr : r.nameEn })),
    { value: 'auth', label: ar ? 'المصادقة' : 'Auth' },
  ];
  const resultOptions = [
    { value: 'all', label: ar ? 'كل النتائج' : 'All results' },
    { value: 'success', label: t.admin.resultSuccess },
    { value: 'failure', label: t.admin.resultFailure },
  ];

  const actionLabel = (e: AuditLogEntry) => (t.admin as Record<string, string>)[AUDIT_ACTION_KEY[e.action]] ?? e.action;
  const resourceLabel = (e: AuditLogEntry) => {
    if (e.resource === 'auth') return ar ? 'المصادقة' : 'Auth';
    const r = RESOURCES.find((x) => x.key === e.resource);
    return r ? (ar ? r.nameAr : r.nameEn) : e.resource;
  };
  const resultPill = (e: AuditLogEntry) => (
    <StatusPill tone={e.result === 'success' ? 'success' : 'danger'} dot={false}>
      {e.result === 'success' ? (
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {t.admin.resultSuccess}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1">
          <XCircle className="w-3.5 h-3.5" />
          {t.admin.resultFailure}
        </span>
      )}
    </StatusPill>
  );

  const columns: DataColumn<AuditLogEntry>[] = [
    {
      key: 'actor',
      header: t.admin.actor,
      hideOnMobile: true,
      cell: (e) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={e.actorName} size="sm" />
          <div className="min-w-0">
            <p className="font-bold text-ragab-ink-800 truncate">{e.actorName}</p>
            <p className="text-caption text-ragab-ink-400">{e.actorRole}</p>
          </div>
        </div>
      ),
    },
    { key: 'action', header: t.admin.action, cell: (e) => actionLabel(e) },
    {
      key: 'target',
      header: t.admin.target,
      cell: (e) => (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-ragab-ink-600">{e.target ?? '—'}</span>
          {e.metadata?.amount && (
            e.action === 'payment_confirmed' ? (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-ragab-success-soft text-ragab-success text-caption font-bold px-1.5 py-0.5"
                title={t.adminPayments.confirmPayment}
              >
                <Wallet className="w-3 h-3" />
                +<span dir="ltr">{e.metadata.amount}</span> {t.common.egp}
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-ragab-danger-soft text-ragab-danger text-caption font-bold px-1.5 py-0.5"
                title={t.admin.refundedAmount}
              >
                <Undo2 className="w-3 h-3" />
                -<span dir="ltr">{e.metadata.amount}</span> {t.common.egp}
              </span>
            )
          )}
        </div>
      ),
    },
    { key: 'date', header: t.admin.dateTime, cell: (e) => <span dir="ltr" className="text-ragab-ink-500">{e.timestamp}</span>, hideOnMobile: true },
    { key: 'result', header: t.admin.result, align: 'end', cell: (e) => resultPill(e) },
  ];

  const actor = selected && staff ? staff[selected.actorId] : undefined;
  const href = selected ? resourceHref(selected) : null;
  const metadata = Object.entries(selected?.metadata ?? {});

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-h2 text-ragab-ink-800">{t.admin.auditTitle}</h2>
        <p className="text-body-sm text-ragab-ink-500 mt-0.5">
          {t.admin.auditSubtitle} {t.admin.auditClickHint}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.admin.searchAudit} startIcon={<Search className="w-4 h-4" />} />
        <Select options={resultOptions} value={result} onChange={(e) => setResult(e.target.value as typeof result)} />
        <Select options={resourceOptions} value={resource} onChange={(e) => setResource(e.target.value as typeof resource)} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-ragab-ink-400" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          keyField={(e) => e.id}
          onRowClick={(e) => setSelected(e)}
          mobileTitle={(e) => (
            <div className="flex items-center gap-2.5">
              <Avatar name={e.actorName} size="sm" />
              <span className="text-ragab-ink-800">{e.actorName}</span>
            </div>
          )}
          mobileMeta={(e) => (
            <StatusPill tone={e.result === 'success' ? 'success' : 'danger'} dot={false}>
              {e.result === 'success' ? t.admin.resultSuccess : t.admin.resultFailure}
            </StatusPill>
          )}
        />
      )}

      <Drawer isOpen={selected !== null} onClose={() => setSelected(null)} title={t.admin.auditDetails} size="md">
        {selected && (
          <div className="space-y-5" data-testid="audit-detail">
            {/* Actor + contact */}
            <section className="rounded-xl border border-ragab-ink-100 p-3">
              <div className="flex items-center gap-3">
                <Avatar name={selected.actorName} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-ragab-ink-800 truncate">{selected.actorName}</p>
                  <p className="text-caption text-ragab-ink-400">{selected.actorRole}</p>
                </div>
                {resultPill(selected)}
              </div>
              <div className="mt-3 border-t border-ragab-ink-100 pt-3">
                <p className="text-caption font-bold text-ragab-ink-500 mb-1.5">{t.admin.auditActorContact}</p>
                {actor ? (
                  <div className="flex flex-wrap gap-2">
                    {actor.phone && (
                      <a
                        href={`tel:${actor.phone}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-ragab-ink-50 px-2.5 py-1.5 text-body-sm text-ragab-ink-700 hover:bg-ragab-ink-100"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span dir="ltr">{actor.phone}</span>
                      </a>
                    )}
                    {actor.email && (
                      <a
                        href={`mailto:${actor.email}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-ragab-ink-50 px-2.5 py-1.5 text-body-sm text-ragab-ink-700 hover:bg-ragab-ink-100"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span dir="ltr">{actor.email}</span>
                      </a>
                    )}
                  </div>
                ) : staffDenied || (staff && !actor) ? (
                  <p className="text-body-sm text-ragab-ink-400">{t.admin.auditNoContact}</p>
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin text-ragab-ink-400" />
                )}
              </div>
            </section>

            {/* What happened */}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-sm">
              <dt className="text-ragab-ink-500">{t.admin.action}</dt>
              <dd className="font-bold text-ragab-ink-800">{actionLabel(selected)}</dd>
              <dt className="text-ragab-ink-500">{t.admin.auditResource}</dt>
              <dd className="text-ragab-ink-800">{resourceLabel(selected)}</dd>
              <dt className="text-ragab-ink-500">{t.admin.target}</dt>
              <dd className="text-ragab-ink-800">{selected.target ?? '—'}</dd>
              <dt className="text-ragab-ink-500">{t.admin.auditResourceId}</dt>
              <dd className="text-ragab-ink-800 break-all">
                {selected.resourceId ? (
                  href ? (
                    <Link href={href} className="inline-flex items-center gap-1 text-ragab-brand-700 hover:underline" dir="ltr">
                      {selected.resourceId}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  ) : (
                    <span dir="ltr">{selected.resourceId}</span>
                  )
                ) : (
                  '—'
                )}
              </dd>
              <dt className="text-ragab-ink-500">{t.admin.dateTime}</dt>
              <dd className="text-ragab-ink-800" dir="ltr">{selected.timestamp}</dd>
            </dl>

            {/* Request forensics */}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-sm rounded-xl bg-ragab-ink-50 p-3">
              <dt className="text-ragab-ink-500">{t.admin.auditRequestId}</dt>
              <dd className="text-ragab-ink-700 break-all" dir="ltr">{selected.requestId ?? '—'}</dd>
              <dt className="text-ragab-ink-500">{t.admin.auditIp}</dt>
              <dd className="text-ragab-ink-700" dir="ltr">{selected.ipAddress ?? '—'}</dd>
              <dt className="text-ragab-ink-500">{t.admin.auditUserAgent}</dt>
              <dd className="text-ragab-ink-700 break-all" dir="ltr">{selected.userAgent ?? '—'}</dd>
            </dl>

            {/* Metadata */}
            <section>
              <p className="text-caption font-bold text-ragab-ink-500 mb-1.5">{t.admin.auditMetadata}</p>
              {metadata.length === 0 ? (
                <p className="text-body-sm text-ragab-ink-400">{t.admin.auditNoMetadata}</p>
              ) : (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-body-sm">
                  {metadata.map(([k, v]) => (
                    <React.Fragment key={k}>
                      <dt className="text-ragab-ink-500" dir="ltr">{k}</dt>
                      <dd className="text-ragab-ink-800 break-all" dir="auto">{String(v)}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              )}
            </section>
          </div>
        )}
      </Drawer>
    </div>
  );
}

export default function AuditLogPage() {
  return (
    <RequirePermission resource="audit" action="view">
      <AuditLogInner />
    </RequirePermission>
  );
}
