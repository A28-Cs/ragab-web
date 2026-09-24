'use client';

import React, { useRef } from 'react';
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import { cn } from '@ragab/utils';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from './Toast';
import { uploadImageFile } from '../../lib/apiClient';

interface ImageUploadProps {
  value?: string;
  onChange: (value: string) => void;
  /** max file size in MB (default 2) */
  maxSizeMb?: number;
  className?: string;
}

/**
 * Image picker that uploads the chosen file to object storage via the API and stores
 * the returned URL. Falls back to an inline data URL if storage is not configured, so
 * the editor keeps working locally. Shows a live preview.
 */
export const ImageUpload: React.FC<ImageUploadProps> = ({ value, onChange, maxSizeMb = 2, className }) => {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  const pick = () => inputRef.current?.click();

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > maxSizeMb * 1024 * 1024) {
      showToast(t.common.imageTooLarge, 'error');
      return;
    }
    try {
      const { url } = await uploadImageFile(file);
      onChange(url);
    } catch {
      // Storage not configured (or upload failed) → fall back to an inline data URL.
      const reader = new FileReader();
      reader.onload = () => onChange(typeof reader.result === 'string' ? reader.result : '');
      reader.readAsDataURL(file);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (file) handleFile(file);
  };

  const onDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className={className}>
      <input ref={inputRef} type="file" accept="image/*" className="sr-only" onChange={onFile} />

      {value ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="w-20 h-20 rounded-xl object-cover border border-ragab-ink-200 shrink-0" />
          <div className="flex flex-col gap-1.5">
            <button type="button" onClick={pick} className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-ragab-ink-700 hover:text-ragab-brand-700 focus-ring rounded-md">
              <RefreshCw className="w-4 h-4" />
              {t.common.changeImage}
            </button>
            <button type="button" onClick={() => onChange('')} className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-ragab-danger hover:opacity-80 focus-ring rounded-md">
              <Trash2 className="w-4 h-4" />
              {t.common.removeImage}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'w-full flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-6 px-4 text-center transition-colors focus-ring',
            dragging
              ? 'border-ragab-brand-500 bg-ragab-cream-soft'
              : 'border-ragab-ink-200 bg-ragab-surface-sunken hover:border-ragab-brand-400 hover:bg-ragab-cream-soft'
          )}
        >
          <span className="flex items-center justify-center w-11 h-11 rounded-full bg-ragab-brand-100 text-ragab-brand-700">
            <ImagePlus className="w-5 h-5" />
          </span>
          <span className="text-body-sm font-bold text-ragab-ink-700">{t.common.uploadImage}</span>
          <span className="text-caption text-ragab-ink-400">{t.common.imageHint}</span>
        </button>
      )}
    </div>
  );
};
