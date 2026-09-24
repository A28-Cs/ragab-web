'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, MoreVertical, Eye, Ban, CheckCircle2, Trash2, Loader2, UserCog } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../components/ui/Toast';
import { getStaff, setStaffStatus, removeStaff } from '../../../services/staffService';
import { DEFAULT_ROLES, PermissionError } from '../../../lib/rbac';
import { StaffStatus, StaffUser } from '../../../types';
import { Input } from '../../../components/ui/Input';
import { DataTable, DataColumn } from '../../../components/ui/DataTable';
import { DropdownMenu } from '../../../components/ui/DropdownMenu';
import { StatusPill, StatusTone } from '../../../components/ui/StatusPill';
import { Avatar } from '../../../components/ui/Avatar';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';

const STATUS_TONE: Record<StaffStatus, StatusTone> = { active: 'success', suspended: 'warning', disabled: 'neutral' };

export default function UsersPage() {
  const { t, language } = useLanguage();
  const ar = language === 'ar';
  const { permissions, hasPermission } = useAuth();
  const { showToast } = useToast();
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [removeTarget, setRemoveTarget] = useState<StaffUser | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setStaff(await getStaff());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const roleName = (roleId: string) => {
    const r = DEFAULT_ROLES.find((x) => x.id === roleId);
    return r ? (ar ? r.nameAr : r.nameEn) : roleId;
  };

  const statusLabel = (s: StaffStatus) => (s === 'active' ? t.admin.active : s === 'suspended' ? t.admin.suspend : t.admin.disabled);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  }, [staff, query]);

  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      showToast(e instanceof PermissionError ? t.states.forbiddenTitle : t.states.error, 'error');
    }
  };

  const onToggle = (u: StaffUser) =>
    guard(async () => {
      await setStaffStatus(u.id, u.status === 'active' ? 'suspended' : 'active', permissions);
      await load();
    });

  const onRemove = () => {
    if (!removeTarget) return;
    setRemoving(true);
    guard(async () => {
      await removeStaff(removeTarget.id, permissions);
      await load();
      showToast(t.admin.remove, 'success');
    }).finally(() => {
      setRemoving(false);
      setRemoveTarget(null);
    });
  };

  const columns: DataColumn<StaffUser>[] = [
    {
      key: 'name',
      header: t.admin.name,
      hideOnMobile: true,
      cell: (u) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={u.name} src={u.avatar} size="sm" />
          <Link href={`/control-center/users/${u.id}`} className="font-bold text-ragab-ink-800 hover:text-ragab-brand-700">
            {u.name}
          </Link>
        </div>
      ),
    },
    { key: 'email', header: t.settings.email, cell: (u) => <span dir="ltr" className="text-ragab-ink-600">{u.email}</span>, hideOnMobile: true },
    { key: 'phone', header: t.settings.phone, cell: (u) => <span dir="ltr" className="text-ragab-ink-600">{u.phone}</span>, hideOnMobile: true },
    { key: 'role', header: t.admin.role, cell: (u) => roleName(u.roleId) },
    { key: 'status', header: t.admin.status, cell: (u) => <StatusPill tone={STATUS_TONE[u.status]}>{statusLabel(u.status)}</StatusPill> },
    { key: 'last', header: t.admin.lastLogin, cell: (u) => <span dir="ltr" className="text-ragab-ink-500">{u.lastLoginAt ?? t.admin.never}</span>, hideOnMobile: true },
    {
      key: 'actions',
      header: t.admin.actions,
      align: 'end',
      cell: (u) => (
        <DropdownMenu
          trigger={
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-ragab-ink-500 hover:bg-ragab-ink-100">
              <MoreVertical className="w-4 h-4" />
            </span>
          }
          items={[
            { label: t.admin.view, icon: <Eye className="w-4 h-4" />, href: `/control-center/users/${u.id}` },
            { label: t.admin.changeRole, icon: <UserCog className="w-4 h-4" />, href: `/control-center/users/${u.id}`, disabled: !hasPermission('users', 'edit') },
            {
              label: u.status === 'active' ? t.admin.suspend : t.admin.enable,
              icon: u.status === 'active' ? <Ban className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />,
              onClick: () => onToggle(u),
              disabled: !hasPermission('users', 'edit'),
            },
            {
              label: t.admin.remove,
              icon: <Trash2 className="w-4 h-4" />,
              destructive: true,
              separatorBefore: true,
              onClick: () => setRemoveTarget(u),
              disabled: !hasPermission('users', 'delete'),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-h2 text-ragab-ink-800">{t.admin.usersTitle}</h2>
        <p className="text-body-sm text-ragab-ink-500 mt-0.5">{t.admin.usersSubtitle}</p>
      </div>

      <div className="max-w-sm">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.admin.searchUsers} startIcon={<Search className="w-4 h-4" />} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-ragab-ink-400" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          keyField={(u) => u.id}
          mobileTitle={(u) => (
            <div className="flex items-center gap-2.5">
              <Avatar name={u.name} src={u.avatar} size="sm" />
              <Link href={`/control-center/users/${u.id}`} className="text-ragab-ink-800">
                {u.name}
              </Link>
            </div>
          )}
        />
      )}

      <ConfirmDialog
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={onRemove}
        title={t.admin.removeUserConfirmTitle}
        description={t.admin.removeUserConfirmDesc}
        confirmLabel={t.admin.remove}
        destructive
        requireReauth
        reauthNote={t.admin.reauthNote}
        isLoading={removing}
      />
    </div>
  );
}
