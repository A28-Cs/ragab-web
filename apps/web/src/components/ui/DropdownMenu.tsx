'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left?: number; right?: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const isRtl = (typeof document !== 'undefined' ? document.documentElement.dir : 'rtl') === 'rtl';
    // "end" in RTL is the LEFT edge, so align the menu's left with the trigger's left.
    const alignLeft = isRtl ? align === 'end' : align === 'start';
    const horizontal = alignLeft
      ? { left: Math.max(8, Math.min(r.left, window.innerWidth - MENU_MIN_WIDTH - 8)) }
      : { right: Math.max(8, Math.min(window.innerWidth - r.right, window.innerWidth - MENU_MIN_WIDTH - 8)) };
    const vertical = side === 'top'
      ? { bottom: window.innerHeight - r.top + MENU_GAP }
      : { top: r.bottom + MENU_GAP };
    setPos({ ...horizontal, ...vertical });
  }, [align, side]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // Any scroll/resize moves the trigger; closing is simpler and safer than tracking it.
    const onMove = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    document.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  const menu = open && pos && typeof document !== 'undefined' ? (
    createPortal(
      <div
        ref={menuRef}
        role="menu"
        style={{ position: 'fixed', ...pos, minWidth: MENU_MIN_WIDTH }}
        className={cn(
          'z-[70] bg-white rounded-xl border border-ragab-ink-200 shadow-popover p-1.5 animate-in fade-in zoom-in-95 duration-150 font-arabic',
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
                <a role="menuitem" href={item.href} className={cls} onClick={() => setOpen(false)}>
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
        onClick={() => setOpen((o) => !o)}
        className="inline-flex focus-ring rounded-lg"
      >
        {trigger}
      </button>
      {menu}
    </div>
  );
};
