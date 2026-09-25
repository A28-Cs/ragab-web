'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@ragab/utils';

export interface DropdownItem {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  destructive?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

interface DropdownMenuProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: 'start' | 'end';
  /** Which side of the trigger the menu opens on. Use 'top' for bottom-anchored triggers. */
  side?: 'bottom' | 'top';
  className?: string;
  menuClassName?: string;
}

const MENU_GAP = 6;
const MENU_MIN_WIDTH = 192; // 12rem

/**
 * The menu is rendered in a portal on <body> with fixed coordinates measured from the
 * trigger. An `absolute` menu inside a scrollable table (`overflow-x: auto`) is clipped
 * by that container — which is exactly why the row "⋮" menus showed nothing — so the
 * menu must escape every ancestor's overflow.
 */
export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  trigger,
  items,
  align = 'end',
  side = 'bottom',
  className = '',
  menuClassName = '',
}) => {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const viewport = window.visualViewport;
    const x = viewport?.offsetLeft ?? 0;
    const y = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const isRtl = getComputedStyle(el).direction === 'rtl';
    const alignLeft = isRtl ? align === 'end' : align === 'start';
    const menu = menuRef.current;
    const menuWidth = Math.min(menu?.offsetWidth || MENU_MIN_WIDTH, width - 16);
    const naturalHeight = menu?.scrollHeight ?? 0;
    const below = Math.max(0, y + height - r.bottom - MENU_GAP - 8);
    const above = Math.max(0, r.top - y - MENU_GAP - 8);
    const upwards = side === 'top'
      ? above >= naturalHeight || above > below
      : below < naturalHeight && above > below;
    const maxHeight = Math.max(0, upwards ? above : below);
    const usedHeight = Math.min(naturalHeight, maxHeight);
    setPos({
      left: Math.max(x + 8, Math.min(alignLeft ? r.left : r.right - menuWidth, x + width - menuWidth - 8)),
      top: Math.max(y + 8, Math.min(upwards ? r.top - MENU_GAP - usedHeight : r.bottom + MENU_GAP, y + height - usedHeight - 8)),
      maxHeight,
      maxWidth: width - 16,
      visibility: 'visible',
    });
  }, [align, side]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, items]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
      if (e.key === 'Tab') setOpen(false);
    };
    const onMove = () => place();
    const onOtherMenu = (event: Event) => {
      if ((event as CustomEvent).detail !== menuId) setOpen(false);
    };
    document.addEventListener('ragab:menu-open', onOtherMenu);
    const observer = new ResizeObserver(place);
    if (menuRef.current) observer.observe(menuRef.current);
    window.visualViewport?.addEventListener('resize', onMove);
    window.visualViewport?.addEventListener('scroll', onMove);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    document.addEventListener('scroll', onMove, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('ragab:menu-open', onOtherMenu);
      window.visualViewport?.removeEventListener('resize', onMove);
      window.visualViewport?.removeEventListener('scroll', onMove);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('scroll', onMove, true);
    };
  }, [open, place, menuId]);

  const menu = open && typeof document !== 'undefined' ? (
    createPortal(
      <div
        ref={menuRef}
        id={menuId}
        role="menu"
        aria-label={triggerRef.current?.getAttribute('aria-label') || undefined}
        onKeyDown={(event) => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const entries = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled):not([aria-disabled="true"])'));
          const index = entries.indexOf(document.activeElement as HTMLElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + entries.length) % entries.length;
          entries[next]?.focus();
        }}
        style={{ position: 'fixed', top: 0, left: 0, visibility: 'hidden', ...pos, minWidth: 'min(192px, calc(100vw - 16px))', overflowY: 'auto', overscrollBehavior: 'contain' }}
        className={cn(
          'z-[70] bg-white rounded-xl border border-ragab-ink-200 shadow-popover p-1.5 font-arabic',
          menuClassName
        )}
      >
        {items.map((item, i) => {
          const content = (
            <>
              {item.icon && <span className="shrink-0">{item.icon}</span>}
              <span className="truncate">{item.label}</span>
            </>
          );
          const cls = cn(
            'w-full flex items-center gap-2.5 rounded-lg px-3 h-10 text-body-sm font-medium transition-colors text-start',
            item.destructive
              ? 'text-ragab-danger hover:bg-ragab-danger-soft'
              : 'text-ragab-ink-700 hover:bg-ragab-ink-100',
            item.disabled && 'opacity-50 cursor-not-allowed pointer-events-none'
          );
          return (
            <React.Fragment key={i}>
              {item.separatorBefore && <div className="my-1 h-px bg-ragab-ink-100" />}
              {item.href ? (
                <a role="menuitem" aria-disabled={item.disabled} tabIndex={item.disabled ? -1 : 0} href={item.disabled ? undefined : item.href} className={cls} onClick={() => setOpen(false)}>
                  {content}
                </a>
              ) : (
                <button
                  role="menuitem"
                  type="button"
                  className={cls}
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onClick?.();
                  }}
                >
                  {content}
                </button>
              )}
            </React.Fragment>
          );
        })}
      </div>,
      document.body
    )
  ) : null;

  return (
    <div className={cn('relative inline-block', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={typeof trigger === 'string' ? trigger : undefined}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            document.dispatchEvent(new CustomEvent('ragab:menu-open', { detail: menuId }));
            setOpen(true);
            requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled):not([aria-disabled="true"])')?.focus());
          }
        }}
        onClick={() => {
          if (!open) document.dispatchEvent(new CustomEvent('ragab:menu-open', { detail: menuId }));
          setOpen((o) => !o);
        }}
        className="inline-flex focus-ring rounded-lg"
      >
        {trigger}
      </button>
      {menu}
    </div>
  );
};
