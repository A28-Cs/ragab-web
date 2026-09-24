'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@ragab/utils';
import { useLanguage } from '../../context/LanguageContext';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  position?: 'right' | 'left' | 'bottom';
  size?: 'sm' | 'md' | 'lg';
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  children,
  position,
  size = 'md',
}) => {
  const { isRTL } = useLanguage();
  const panelRef = useRef<HTMLDivElement>(null);
  // Callers almost always pass an inline `onClose` (a new function every render). If the
  // focus-trap effect depended on it, every keystroke in a form inside the drawer would
  // re-run the effect and yank focus to the first focusable element (the close button).
  // Keep the latest callback in a ref so the effect only runs when the drawer opens/closes.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Default position according to RTL (end side). Callers whose trigger sits on
  // the start side (e.g. the header menu button) pass an explicit `position`.
  const effectivePosition = position || (isRTL ? 'left' : 'right');

  // Body scroll lock with scrollbar-width compensation (prevents layout shift)
  useEffect(() => {
    if (!isOpen) return;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('has-modal-open');
    if (scrollbarWidth > 0) {
      document.body.style.paddingInlineEnd = `${scrollbarWidth}px`;
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingInlineEnd = '';
      document.body.classList.remove('has-modal-open');
    };
  }, [isOpen]);

  // Escape to close + focus trap
  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Move focus into the panel
    const panel = panelRef.current;
    const focusables = panel?.querySelectorAll<HTMLElement>(FOCUSABLE);
    focusables?.[0]?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (items.length === 0) return;
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

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
    // Deliberately NOT depending on onClose — see onCloseRef above.
  }, [isOpen]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-xs',
    md: 'max-w-md',
    lg: 'max-w-lg',
  };

  const isBottom = effectivePosition === 'bottom';

  const positionStyles = {
    right: 'top-0 right-0 h-full w-full animate-in slide-in-from-right duration-300',
    left: 'top-0 left-0 h-full w-full animate-in slide-in-from-left duration-300',
    bottom:
      'bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl animate-in slide-in-from-bottom duration-300',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" data-modal-open="true" aria-label={title}>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-[2px] animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        className={cn(
          'fixed bg-white shadow-popover flex flex-col z-10',
          positionStyles[effectivePosition],
          !isBottom && sizes[size]
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-ragab-ink-100 bg-ragab-cream-soft shrink-0">
          {title && (
            <h3 className="text-h3 text-ragab-ink-800 font-arabic">{title}</h3>
          )}
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="touch-target p-1.5 text-ragab-ink-500 hover:text-ragab-ink-800 rounded-lg hover:bg-ragab-brand-100/60 transition-colors flex items-center justify-center focus-ring"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
};
