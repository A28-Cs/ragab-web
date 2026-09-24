import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@ragab/utils';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  position?: 'left' | 'right';
  children: React.ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  position = 'left',
  children,
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div
        className={cn(
          'fixed inset-y-0 max-w-full flex bg-white shadow-2xl transition-transform duration-300 ease-in-out w-full sm:w-96',
          position === 'left' ? 'left-0' : 'right-0'
        )}
      >
        <div className="w-full flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-ragab-cream-soft">
            {title && <h2 className="text-lg font-extrabold text-ragab-charcoal font-arabic">{title}</h2>}
            <button
              onClick={onClose}
              className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">{children}</div>
        </div>
      </div>
    </div>
  );
};
