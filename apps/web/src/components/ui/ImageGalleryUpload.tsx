'use client';

import React, { useRef, useState } from 'react';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { cn } from '@ragab/utils';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from './Toast';
import { uploadImageFile } from '../../lib/apiClient';

interface ImageGalleryUploadProps {
  value: string[];
  onChange: (urls: string[]) => void;
  /** max number of extra photos (default 6) */
  maxImages?: number;
  /** max file size in MB (default 2) */
  maxSizeMb?: number;
  className?: string;
}

/**
 * A small gallery of extra product photos (beyond the single cover image) — shown to
 * customers on the product detail page so they can browse more than one angle.
 */
export const ImageGalleryUpload: React.FC<ImageGalleryUploadProps> = ({
  value, onChange, maxImages = 6, maxSizeMb = 2, className,
}) => {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const pick = () => inputRef.current?.click();

  const addFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > maxSizeMb * 1024 * 1024) {
      showToast(t.common.imageTooLarge, 'error');
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadImageFile(file);
      onChange([...value, url]);
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') onChange([...value, reader.result as string]);
      };
      reader.readAsDataURL(file);
    } finally {
      setUploading(false);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) addFile(file);
  };

  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));

  const canAddMore = value.length < maxImages;

  return (
    <div className={cn('flex flex-wrap gap-2.5', className)}>
      <input ref={inputRef} type="file" accept="image/*" className="sr-only" onChange={onFile} />
      {value.map((url, i) => (
        <div key={`${url}-${i}`} className="relative w-20 h-20 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="w-full h-full rounded-xl object-cover border border-ragab-ink-200" />
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label={t.common.removeImage}
            className="absolute -top-1.5 -end-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-ragab-ink-800 text-white shadow-subtle hover:bg-ragab-danger focus-ring"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      {canAddMore && (
        <button
          type="button"
          onClick={pick}
          disabled={uploading}
          className={cn(
            'w-20 h-20 shrink-0 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-ragab-ink-200 bg-ragab-surface-sunken text-ragab-ink-400',
            'hover:border-ragab-brand-400 hover:bg-ragab-cream-soft hover:text-ragab-brand-700 transition-colors focus-ring disabled:opacity-60'
          )}
        >
          {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
          <span className="text-[11px] font-bold">{t.adminProducts.addImage}</span>
        </button>
      )}
    </div>
  );
};
