'use client';

import React from 'react';
import Link from 'next/link';
import {
  Clock,
  LogIn,
  ShieldAlert,
  Ban,
  PauseCircle,
  MailWarning,
  Lock,
} from 'lucide-react';
import { cn } from '@ragab/utils';
import { Button } from '../ui/Button';
import { useLanguage } from '../../context/LanguageContext';

export type AuthStateVariant =
  | 'session-expired'
  | 'unauthorized'
  | 'forbidden'
  | 'disabled'
  | 'suspended'
  | 'verification-required'
  | 'locked';

interface AuthStatePanelProps {
  variant: AuthStateVariant;
  /** Override the primary action */
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

export const AuthStatePanel: React.FC<AuthStatePanelProps> = ({
  variant,
  actionHref,
  onAction,
  className = '',
}) => {
  const { t } = useLanguage();
  const s = t.authStates;

  const config: Record<
    AuthStateVariant,
    { icon: React.ReactNode; tone: string; title: string; what: string; action: string; href: string; cta: string }
  > = {
    'session-expired': {
      icon: <Clock className="w-8 h-8" />,
      tone: 'bg-ragab-warning-soft text-ragab-warning',
      title: s.sessionExpiredTitle,
      what: s.sessionExpiredWhat,
      action: s.sessionExpiredAction,
      href: '/login',
      cta: t.states.goToLogin,
    },
    unauthorized: {
      icon: <LogIn className="w-8 h-8" />,
      tone: 'bg-ragab-info-soft text-ragab-info',
      title: s.unauthorizedTitle,
      what: s.unauthorizedWhat,
      action: s.unauthorizedAction,
      href: '/login',
      cta: t.states.goToLogin,
    },
    forbidden: {
      icon: <ShieldAlert className="w-8 h-8" />,
      tone: 'bg-ragab-danger-soft text-ragab-danger',
      title: s.forbiddenTitle,
      what: s.forbiddenWhat,
      action: s.forbiddenAction,
      href: '/',
      cta: t.states.backToStore,
    },
    disabled: {
      icon: <Ban className="w-8 h-8" />,
      tone: 'bg-ragab-danger-soft text-ragab-danger',
      title: s.disabledTitle,
      what: s.disabledWhat,
      action: s.disabledAction,
      href: '/contact',
      cta: s.contactSupport,
    },
    suspended: {
      icon: <PauseCircle className="w-8 h-8" />,
      tone: 'bg-ragab-warning-soft text-ragab-warning',
      title: s.suspendedTitle,
      what: s.suspendedWhat,
      action: s.suspendedAction,
      href: '/contact',
      cta: s.contactSupport,
    },
    'verification-required': {
      icon: <MailWarning className="w-8 h-8" />,
      tone: 'bg-ragab-info-soft text-ragab-info',
      title: s.verificationRequiredTitle,
      what: s.verificationRequiredWhat,
      action: s.verificationRequiredAction,
      href: '/verify',
      cta: s.verifyNow,
    },
    locked: {
      icon: <Lock className="w-8 h-8" />,
      tone: 'bg-ragab-danger-soft text-ragab-danger',
      title: s.lockedTitle,
      what: s.lockedWhat,
      action: s.lockedAction,
      href: '/forgot-password',
      cta: t.states.goToLogin,
    },
  };

  const c = config[variant];
  const href = actionHref ?? c.href;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center max-w-md mx-auto py-12 px-6 font-arabic',
        className
      )}
    >
      <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center mb-5', c.tone)}>{c.icon}</div>
      <h1 className="text-h2 text-ragab-ink-800 mb-4">{c.title}</h1>

      <div className="w-full text-start bg-ragab-surface-sunken rounded-xl border border-ragab-ink-200 p-4 space-y-3 mb-6">
        <div>
          <p className="text-caption font-bold text-ragab-ink-500 mb-0.5">{s.whatHappened}</p>
          <p className="text-body-sm text-ragab-ink-700">{c.what}</p>
        </div>
        <div>
          <p className="text-caption font-bold text-ragab-ink-500 mb-0.5">{s.whatToDo}</p>
          <p className="text-body-sm text-ragab-ink-700">{c.action}</p>
        </div>
      </div>

      {onAction ? (
        <Button variant="primary" size="lg" onClick={onAction} fullWidth>
          {c.cta}
        </Button>
      ) : (
        <Link href={href} className="w-full">
          <Button variant="primary" size="lg" fullWidth>
            {c.cta}
          </Button>
        </Link>
      )}
    </div>
  );
};
