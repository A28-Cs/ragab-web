'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'md',
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.classList.add('has-modal-open');
    } else {
      document.body.style.overflow = '';
      document.body.classList.remove('has-modal-open');
    }
    return () => {
      document.body.style.overflow = '';
      document.body.classList.remove('has-modal-open');
    };
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const maxWidths = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      data-modal-open="true"
    >
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Dialog container */}
      <div
        className={`relative w-full ${maxWidths[maxWidth]} bg-white rounded-xl shadow-popover p-6 z-10 animate-in zoom-in-95 duration-200 border border-gray-100 max-h-[90vh] flex flex-col`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-4 flex-shrink-0">
          {title ? (
            <h3 className="text-lg font-bold text-ragab-charcoal font-arabic">{title}</h3>
          ) : (
            <div />
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-ragab-charcoal rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-grow pr-1">{children}</div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};

