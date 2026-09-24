'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, Loader2, Mail, Phone, CalendarDays, ShieldCheck, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@ragab/utils';
import { useAuth } from '../../../../context/AuthContext';
import { useLanguage } from '../../../../context/LanguageContext';
import { useToast } from '../../../../components/ui/Toast';
import { getStaffMember, changeStaffRole } from '../../../../services/staffService';
import { getAuditLog } from '../../../../services/auditService';
import { DEFAULT_ROLES, expandPermissions, PermissionError } from '../../../../lib/rbac';
import { AuditLogEntry, PermissionKey, StaffUser } from '../../../../types';
import { Card, CardHeader } from '../../../../components/ui/Card';
import { Tabs } from '../../../../components/ui/Tabs';
import { Avatar } from '../../../../components/ui/Avatar';
import { StatusPill } from '../../../../components/ui/StatusPill';
import { Select } from '../../../../components/ui/Select';
import { FormField } from '../../../../components/ui/FormField';
import { PermissionMatrix } from '../../../../components/ui/PermissionMatrix';
import { Alert } from '../../../../components/ui/Alert';
import { AUDIT_ACTION_KEY } from '../../../../lib/audit';

export default function StaffDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const { t, language } = useLanguage();
  const ar = language === 'ar';
  const { permissions, hasPermission } = useAuth();
  const { showToast } = useToast();
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [activity, setActivity] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('profile');

  const load = async () => {
    setLoading(true);
    try {
      const [s, log] = await Promise.all([getStaffMember(id), getAuditLog()]);
      setStaff(s);
      if (s) setActivity(log.filter((l) => l.actorId === s.id));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [id]);

  const role = useMemo(() => (staff ? DEFAULT_ROLES.find((r) => r.id === staff.roleId) ?? null : null), [staff]);
  const rolePerms = useMemo<Set<PermissionKey>>(() => expandPermissions(role?.permissions, []), [role]);
  const effective = useMemo<Set<PermissionKey>>(() => expandPermissions(role?.permissions, staff?.directPermissions), [role, staff]);

  const onChangeRole = async (roleId: string) => {
    if (!staff) return;
    try {
      await changeStaffRole(staff.id, roleId, permissions);
      setStaff({ ...staff, roleId });
      showToast(t.admin.roleSaved, 'success');
    } catch (e) {
      showToast(e instanceof PermissionError ? t.states.forbiddenTitle : t.states.error, 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-ragab-ink-400" />
      </div>
    );
  }
  if (!staff) {
    return <p className="text-body-sm text-ragab-ink-500">{t.states.error}</p>;
  }

  const tabs = [
    { value: 'profile', label: t.admin.tabProfile },
    { value: 'role', label: t.admin.tabRole },
    { value: 'permissions', label: t.admin.tabPermissions },
    { value: 'activity', label: t.admin.tabActivity },
    { value: 'security', label: t.admin.tabSecurity },
  ];

  const roleOptions = DEFAULT_ROLES.map((r) => ({ value: r.id, label: ar ? r.nameAr : r.nameEn }));

  return (
    <div className="space-y-4">
      <Link href="/control-center/users" className="inline-flex items-center gap-1 text-caption font-semibold text-ragab-ink-500 hover:text-ragab-ink-800">
        <ChevronLeft className="w-4 h-4 ltr:rotate-180" />
        {t.admin.usersTitle}
      </Link>

      {/* Header */}
      <Card>
        <div className="flex items-center gap-4 flex-wrap">
          <Avatar name={staff.name} src={staff.avatar} size="xl" />
          <div className="min-w-0">
            <h2 className="text-h2 text-ragab-ink-800">{staff.name}</h2>
            <p className="text-body-sm text-ragab-ink-500" dir="ltr">{staff.email}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <StatusPill tone={staff.status === 'active' ? 'success' : staff.status === 'suspended' ? 'warning' : 'neutral'}>
                {staff.status === 'active' ? t.admin.active : staff.status === 'suspended' ? t.admin.suspend : t.admin.disabled}
              </StatusPill>
              {role && (
                <span className="inline-flex items-center gap-1 text-caption font-semibold text-ragab-ink-600">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {ar ? role.nameAr : role.nameEn}
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Tabs items={tabs} value={tab} onChange={setTab} variant="segmented" />

      {tab === 'profile' && (
        <Card>
          <CardHeader title={t.admin.tabProfile} />
          <div className="grid sm:grid-cols-2 gap-4">
            <Field icon={Mail} label={t.settings.email} value={staff.email} ltr />
            <Field icon={Phone} label={t.settings.phone} value={staff.phone} ltr />
            <Field icon={CalendarDays} label={t.admin.createdDate} value={staff.createdAt} ltr />
            <Field icon={CalendarDays} label={t.admin.lastLogin} value={staff.lastLoginAt ?? t.admin.never} ltr />
          </div>
        </Card>
      )}

      {tab === 'role' && (
        <Card>
          <CardHeader title={t.admin.tabRole} />
          <div className="max-w-sm">
            <FormField label={t.admin.role}>
              <Select options={roleOptions} value={staff.roleId} onChange={(e) => onChangeRole(e.target.value)} disabled={!hasPermission('users', 'edit')} />
            </FormField>
          </div>
          {role && <p className="text-body-sm text-ragab-ink-500 mt-3">{ar ? role.descriptionAr : role.descriptionEn}</p>}
        </Card>
      )}

      {tab === 'permissions' && (
        <div className="space-y-4">
          <Alert kind="info">{t.admin.directPermissionsDesc}</Alert>

          <Card>
            <CardHeader title={t.admin.rolePermissions} subtitle={role ? (ar ? role.nameAr : role.nameEn) : ''} />
            <p className="text-caption text-ragab-ink-500 mb-3">
              {rolePerms.size} {t.admin.selectedPermissions}
            </p>
          </Card>

          <Card>
            <CardHeader title={t.admin.directPermissions} />
            {staff.directPermissions.length === 0 ? (
              <p className="text-body-sm text-ragab-ink-500">{t.admin.noDirectPermissions}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {staff.directPermissions.map((p) => (
                  <span key={p} className="text-caption bg-ragab-info-soft text-ragab-info rounded-md px-2 py-0.5 border border-blue-200" dir="ltr">
                    {p}
                  </span>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title={t.admin.effectivePermissions} subtitle={`${effective.size} ${t.admin.selectedPermissions}`} />
            <PermissionMatrix value={effective} readOnly />
          </Card>
        </div>
      )}

      {tab === 'activity' && (
        <Card>
          <CardHeader title={t.admin.tabActivity} />
          {activity.length === 0 ? (
            <p className="text-body-sm text-ragab-ink-500">{t.states.empty}</p>
          ) : (
            <ul className="divide-y divide-ragab-ink-100">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className={cn('flex items-center justify-center w-8 h-8 rounded-lg shrink-0', a.result === 'success' ? 'bg-ragab-success-soft text-ragab-success' : 'bg-ragab-danger-soft text-ragab-danger')}>
                    {a.result === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm text-ragab-ink-700">
                      {(t.admin as Record<string, string>)[AUDIT_ACTION_KEY[a.action]]}
                      {a.target ? ` — ${a.target}` : ''}
                    </p>
                    <p className="text-caption text-ragab-ink-400">{a.timestamp}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'security' && (
        <Card>
          <CardHeader title={t.admin.tabSecurity} />
          <div className="grid sm:grid-cols-2 gap-4">
            <Field icon={CalendarDays} label={t.admin.lastLogin} value={staff.lastLoginAt ?? t.admin.never} ltr />
            <Field icon={ShieldCheck} label={t.admin.status} value={staff.status === 'active' ? t.admin.active : staff.status === 'suspended' ? t.admin.suspend : t.admin.disabled} />
          </div>
        </Card>
      )}
    </div>
  );
}

const Field: React.FC<{ icon: React.ElementType; label: string; value: string; ltr?: boolean }> = ({ icon: Icon, label, value, ltr }) => (
  <div className="flex items-center gap-3 rounded-lg border border-ragab-ink-100 p-3">
    <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-ragab-ink-100 text-ragab-ink-600 shrink-0">
      <Icon className="w-4 h-4" />
    </span>
    <div className="min-w-0">
      <p className="text-caption text-ragab-ink-500">{label}</p>
      <p className="text-body-sm font-semibold text-ragab-ink-800 truncate" dir={ltr ? 'ltr' : undefined}>
        {value}
      </p>
    </div>
  </div>
);
