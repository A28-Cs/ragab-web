'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { cn } from '@ragab/utils';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const icons: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 className="w-5 h-5 text-ragab-success shrink-0" />,
  error: <AlertCircle className="w-5 h-5 text-ragab-danger shrink-0" />,
  info: <Info className="w-5 h-5 text-ragab-info shrink-0" />,
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const showToast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev.slice(-2), { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Stack sits above the mobile bottom nav */}
      <div
        aria-live="polite"
        className="fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+12px)] md:bottom-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-center gap-2.5 bg-ragab-ink-800 text-white rounded-xl shadow-popover px-4 py-3 text-body-sm font-semibold font-arabic max-w-sm w-full sm:w-auto',
              'animate-in slide-in-from-bottom-4 fade-in duration-300'
            )}
          >
            {icons[toast.kind]}
            <span className="min-w-0">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
