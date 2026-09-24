'use client';

import React from 'react';
import { cn } from '@ragab/utils';

export interface DataColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: 'start' | 'end' | 'center';
  headerClassName?: string;
  cellClassName?: string;
  /** omit this column from the stacked mobile card */
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  keyField: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Heading shown at the top of each mobile card (defaults to the first column) */
  mobileTitle?: (row: T) => React.ReactNode;
  /** Trailing content (e.g. actions) in the mobile card header */
  mobileMeta?: (row: T) => React.ReactNode;
  className?: string;
}

const alignClass = {
  start: 'text-start',
  end: 'text-end',
  center: 'text-center',
};

export function DataTable<T>({
  columns,
  rows,
  keyField,
  onRowClick,
  mobileTitle,
  mobileMeta,
  className = '',
}: DataTableProps<T>) {
  return (
    <div className={cn('font-arabic', className)}>
      {/* Desktop / tablet table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-ragab-ink-200 bg-white">
        <table className="w-full border-collapse text-body-sm">
          <thead>
            <tr className="bg-ragab-surface-sunken border-b border-ragab-ink-200">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-label text-ragab-ink-500 font-semibold whitespace-nowrap',
                    alignClass[col.align ?? 'start'],
                    col.headerClassName
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={keyField(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-ragab-ink-100 last:border-0 transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-ragab-ink-50'
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-3 text-ragab-ink-700 align-middle',
                      alignClass[col.align ?? 'start'],
                      col.cellClassName
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <div className="md:hidden flex flex-col gap-3">
        {rows.map((row) => {
          const stacked = columns.filter((c) => !c.hideOnMobile);
          return (
            <div
              key={keyField(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'bg-white rounded-xl border border-ragab-ink-200 shadow-subtle p-4',
                onRowClick && 'cursor-pointer active:scale-[0.99] transition-transform'
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0 font-bold text-ragab-ink-800">
                  {mobileTitle ? mobileTitle(row) : columns[0].cell(row)}
                </div>
                {mobileMeta && <div className="shrink-0">{mobileMeta(row)}</div>}
              </div>
              <dl className="grid grid-cols-1 xs:grid-cols-2 gap-x-4 gap-y-2">
                {stacked.map((col) => (
                  <div key={col.key} className="flex items-center justify-between gap-2 min-w-0">
                    <dt className="text-caption text-ragab-ink-500 shrink-0">{col.header}</dt>
                    <dd className="text-body-sm text-ragab-ink-700 truncate text-end">{col.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}
