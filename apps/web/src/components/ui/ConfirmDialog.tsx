'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@ragab/utils';
import { Button } from './Button';
import { useLanguage } from '../../context/LanguageContext';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reauth?: string, code?: string) => void | Promise<void>;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Show a password field the user must fill before confirming (re-auth) */
  requireReauth?: boolean;
  reauthNote?: string;
  reauthLabel?: string;
  /** Also require a one-time code (2FA) passed as the second arg to onConfirm */
  requireCode?: boolean;
  codeLabel?: string;
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  requireReauth = false,
  reauthNote,
  reauthLabel,
  requireCode = false,
  codeLabel,
  isLoading = false,
}) => {
  const { t } = useLanguage();
  const panelRef = useRef<HTMLDivElement>(null);
  const [reauth, setReauth] = useState('');
  const [code, setCode] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Same rule as Drawer: callers pass an inline `onClose`, so the focus-trap effect must
  // not depend on it — otherwise every keystroke in the re-auth field re-runs the effect
  // and moves focus back to the first focusable element.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      setReauth('');
      setCode('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('has-modal-open');
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelectorAll<HTMLElement>(FOCUSABLE)?.[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onCloseRef.current();
      if (e.key !== 'Tab' || !panel) return;
      const items = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.body.classList.remove('has-modal-open');
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
    // Deliberately NOT depending on onClose — see onCloseRef above.
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const confirmDisabled =
    isLoading ||
    (requireReauth && reauth.trim().length === 0) ||
    (requireCode && code.trim().length === 0);

  const dialogContent = (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      data-modal-open="true"
      aria-label={title}
    >
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] animate-in fade-in duration-200" onClick={onClose} />
      <div
        ref={panelRef}
        className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-popover p-6 animate-in zoom-in-95 duration-200 font-arabic"
      >
        <div className="flex items-start gap-3.5">
          <span
            className={cn(
              'flex items-center justify-center w-11 h-11 rounded-full shrink-0',
              destructive ? 'bg-ragab-danger-soft text-ragab-danger' : 'bg-ragab-brand-100 text-ragab-brand-700'
            )}
          >
            <AlertTriangle className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-h3 text-ragab-ink-800">{title}</h3>
            {description && <div className="text-body-sm text-ragab-ink-500 mt-1">{description}</div>}
          </div>
        </div>

        {requireReauth && (
          <div className="mt-4">
            {reauthNote && <p className="text-caption text-ragab-ink-500 mb-1.5">{reauthNote}</p>}
            <input
              type="password"
              value={reauth}
              onChange={(e) => setReauth(e.target.value)}
              placeholder={reauthLabel ?? t.security.currentPassword}
              className="w-full rounded-lg border border-ragab-ink-300 h-11 px-3.5 text-body-sm focus-ring focus:border-ragab-brand-500"
            />
            {requireCode && (
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={codeLabel}
                className="mt-2 w-full rounded-lg border border-ragab-ink-300 h-11 px-3.5 text-body-sm focus-ring focus:border-ragab-brand-500"
              />
            )}
          </div>
        )}

        <div className="flex items-center gap-2.5 mt-6">
          <Button variant="outline" onClick={onClose} fullWidth disabled={isLoading}>
            {cancelLabel ?? t.common.cancel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={() => onConfirm(reauth)}
            fullWidth
            isLoading={isLoading}
            disabled={confirmDisabled}
          >
            {confirmLabel ?? t.common.confirm}
          </Button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(dialogContent, document.body) : null;
};

