'use client';

import React from 'react';
import { Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@ragab/utils';

type AlertKind = 'info' | 'success' | 'warning' | 'danger';

interface AlertProps {
  kind?: AlertKind;
  title?: string;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

const styles: Record<AlertKind, { wrap: string; icon: React.ReactNode }> = {
  info: {
    wrap: 'bg-ragab-info-soft border-ragab-info/25 text-ragab-info',
    icon: <Info className="w-5 h-5" />,
  },
  success: {
    wrap: 'bg-ragab-success-soft border-ragab-success/25 text-ragab-success',
    icon: <CheckCircle2 className="w-5 h-5" />,
  },
  warning: {
    wrap: 'bg-ragab-warning-soft border-ragab-warning/25 text-ragab-warning',
    icon: <AlertTriangle className="w-5 h-5" />,
  },
  danger: {
    wrap: 'bg-ragab-danger-soft border-ragab-danger/25 text-ragab-danger',
    icon: <XCircle className="w-5 h-5" />,
  },
};

export const Alert: React.FC<AlertProps> = ({ kind = 'info', title, children, icon, className = '' }) => {
  const s = styles[kind];
  return (
    <div
      role="status"
      className={cn('flex items-start gap-3 rounded-xl border p-3.5 font-arabic', s.wrap, className)}
    >
      <span className="shrink-0 mt-0.5">{icon ?? s.icon}</span>
      <div className="min-w-0 text-ragab-ink-700">
        {title && <p className="text-body-sm font-bold text-ragab-ink-800">{title}</p>}
        {children && <div className="text-body-sm">{children}</div>}
      </div>
    </div>
  );
};
