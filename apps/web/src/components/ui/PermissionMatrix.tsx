'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@ragab/utils';
import { useLanguage } from '../../context/LanguageContext';
import { ACTIONS, RESOURCES, permKey } from '../../lib/rbac';
import type { Action, PermissionKey, Resource } from '../../types';
import { Checkbox } from './Checkbox';

interface PermissionMatrixProps {
  value: Set<PermissionKey>;
  onChange?: (next: Set<PermissionKey>) => void;
  readOnly?: boolean;
  className?: string;
}

const GROUP_LABELS: Record<string, { ar: string; en: string }> = {
  catalog: { ar: 'الكتالوج', en: 'Catalog' },
  operations: { ar: 'العمليات', en: 'Operations' },
  people: { ar: 'المستخدمون', en: 'People' },
  system: { ar: 'النظام', en: 'System' },
};

export const PermissionMatrix: React.FC<PermissionMatrixProps> = ({
  value,
  onChange,
  readOnly = false,
  className = '',
}) => {
  const { language } = useLanguage();
  const ar = language === 'ar';

  const toggle = (resource: Resource, action: Action, on: boolean) => {
    if (readOnly || !onChange) return;
    const next = new Set(value);
    const key = permKey(resource, action);
    if (on) next.add(key);
    else next.delete(key);
    onChange(next);
  };

  const toggleResourceAll = (resource: Resource, actions: Action[], on: boolean) => {
    if (readOnly || !onChange) return;
    const next = new Set(value);
    actions.forEach((a) => {
      const key = permKey(resource, a);
      if (on) next.add(key);
      else next.delete(key);
    });
    onChange(next);
  };

  const groups = ['catalog', 'operations', 'people', 'system'] as const;

  return (
    <div className={cn('font-arabic', className)}>
      {/* Desktop matrix */}
      <div className="hidden lg:block overflow-x-auto rounded-xl border border-ragab-ink-200 bg-white">
        <table className="w-full border-collapse text-body-sm">
          <thead>
            <tr className="bg-ragab-surface-sunken border-b border-ragab-ink-200">
              <th className="px-4 py-3 text-start text-label text-ragab-ink-500 sticky start-0 bg-ragab-surface-sunken">
                {ar ? 'المورد' : 'Resource'}
              </th>
              {ACTIONS.map((a) => (
                <th key={a.key} className="px-2 py-3 text-center text-label text-ragab-ink-500 whitespace-nowrap">
                  {ar ? a.nameAr : a.nameEn}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <React.Fragment key={g}>
                <tr className="bg-ragab-cream-soft">
                  <td colSpan={ACTIONS.length + 1} className="px-4 py-1.5 text-caption font-bold text-ragab-ink-600">
                    {ar ? GROUP_LABELS[g].ar : GROUP_LABELS[g].en}
                  </td>
                </tr>
                {RESOURCES.filter((r) => r.group === g).map((r) => (
                  <tr key={r.key} className="border-b border-ragab-ink-100 last:border-0">
                    <td className="px-4 py-2.5 font-semibold text-ragab-ink-800 whitespace-nowrap sticky start-0 bg-white">
                      {ar ? r.nameAr : r.nameEn}
                    </td>
                    {ACTIONS.map((a) => {
                      const supported = r.actions.includes(a.key);
                      const key = permKey(r.key, a.key);
                      return (
                        <td key={a.key} className="px-2 py-2.5 text-center">
                          {supported ? (
                            <div className="flex justify-center">
                              <Checkbox
                                size="sm"
                                checked={value.has(key)}
                                disabled={readOnly}
                                onChange={(on) => toggle(r.key, a.key, on)}
                              />
                            </div>
                          ) : (
                            <span className="text-ragab-ink-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile / tablet accordion */}
      <div className="lg:hidden flex flex-col gap-2">
        {RESOURCES.map((r) => (
          <ResourceAccordion
            key={r.key}
            resourceKey={r.key}
            name={ar ? r.nameAr : r.nameEn}
            actions={r.actions}
            value={value}
            readOnly={readOnly}
            onToggle={toggle}
            onToggleAll={toggleResourceAll}
            ar={ar}
          />
        ))}
      </div>
    </div>
  );
};

const ResourceAccordion: React.FC<{
  resourceKey: Resource;
  name: string;
  actions: Action[];
  value: Set<PermissionKey>;
  readOnly: boolean;
  ar: boolean;
  onToggle: (r: Resource, a: Action, on: boolean) => void;
  onToggleAll: (r: Resource, actions: Action[], on: boolean) => void;
}> = ({ resourceKey, name, actions, value, readOnly, ar, onToggle, onToggleAll }) => {
  const [open, setOpen] = useState(false);
  const selectedCount = actions.filter((a) => value.has(permKey(resourceKey, a))).length;
  const allOn = selectedCount === actions.length;

  return (
    <div className="rounded-xl border border-ragab-ink-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 focus-ring"
      >
        <span className="font-semibold text-ragab-ink-800">{name}</span>
        <span className="flex items-center gap-2">
          {selectedCount > 0 && (
            <span className="text-caption font-bold text-ragab-brand-700 bg-ragab-brand-100 rounded-full px-2 py-0.5">
              {selectedCount}/{actions.length}
            </span>
          )}
          <ChevronDown className={cn('w-4 h-4 text-ragab-ink-400 transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      {open && (
        <div className="px-4 pb-3 pt-1 border-t border-ragab-ink-100">
          {!readOnly && (
            <div className="pb-2 mb-2 border-b border-ragab-ink-100">
              <Checkbox
                size="sm"
                checked={allOn}
                onChange={(on) => onToggleAll(resourceKey, actions, on)}
                label={<span className="text-caption font-semibold">{ar ? 'تحديد الكل' : 'Select all'}</span>}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {actions.map((a) => {
              const meta = ACTIONS.find((x) => x.key === a)!;
              return (
                <Checkbox
                  key={a}
                  size="sm"
                  checked={value.has(permKey(resourceKey, a))}
                  disabled={readOnly}
                  onChange={(on) => onToggle(resourceKey, a, on)}
                  label={<span className="text-body-sm">{ar ? meta.nameAr : meta.nameEn}</span>}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
