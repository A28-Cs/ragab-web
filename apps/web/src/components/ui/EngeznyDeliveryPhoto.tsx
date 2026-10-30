'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { engeznyDb } from '../../lib/firebase';

interface Props {
  orderId: string;
  initialUrl?: string | null;
}

/**
 * Displays the delivery proof photo taken by the courier in Engezny.
 * Uses initialUrl from server DTO directly if available, with client Firestore fallback.
 */
export function EngeznyDeliveryPhoto({ orderId, initialUrl }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialUrl || null);
  const [loading, setLoading] = useState<boolean>(!initialUrl);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);

  useEffect(() => {
    if (initialUrl) {
      setPhotoUrl(initialUrl);
      setLoading(false);
      return;
    }

    if (!engeznyDb || !orderId) {
      setLoading(false);
      return;
    }

    getDoc(doc(engeznyDb, 'orders', orderId))
      .then((snap) => {
        if (snap.exists()) {
          const d = snap.data();
          const candidate =
            d?.deliveryPhotoUrl ||
            d?.photoUrl ||
            d?.deliveryPhoto ||
            d?.deliveredPhotoUrl ||
            d?.proofPhotoUrl;
          if (candidate) setPhotoUrl(candidate);
        }
      })
      .catch(() => {
        // silently ignore if Engezny client is not configured
      })
      .finally(() => setLoading(false));
  }, [orderId, initialUrl]);

  if (loading) {
    return <p className="text-caption text-ragab-ink-400 py-3">جاري تحميل صورة التوصيل...</p>;
  }

  if (!photoUrl) {
    return (
      <div className="rounded-xl bg-ragab-ink-50/60 p-4 text-center border border-dashed border-ragab-ink-200">
        <p className="text-caption text-ragab-ink-500">
          لم يتم رفع صورة إثبات توصيل لهذا الطلب حتى الآن.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-caption font-medium text-ragab-ink-600 flex items-center gap-1.5">
          <span>📸</span>
          <span>صورة التحقق وإثبات التوصيل أمام باب العميل:</span>
        </p>
        <button
          type="button"
          onClick={() => setIsZoomed(true)}
          className="text-xs text-brand-600 hover:text-brand-700 font-semibold underline"
        >
          عرض بالحجم الكامل
        </button>
      </div>

      <div
        className="relative group cursor-pointer overflow-hidden rounded-2xl border border-ragab-ink-200 bg-black/5 shadow-sm inline-block"
        onClick={() => setIsZoomed(true)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt="صورة إثبات التوصيل"
          className="max-h-64 w-auto rounded-2xl object-contain transition-transform duration-200 group-hover:scale-[1.02]"
        />
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium gap-1">
          <span>🔍 اضغط للتكبير</span>
        </div>
      </div>

      {isZoomed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setIsZoomed(false)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-transparent">
            <button
              type="button"
              onClick={() => setIsZoomed(false)}
              className="absolute -top-10 left-0 bg-white/20 hover:bg-white/40 text-white rounded-full px-3 py-1 text-sm font-bold"
            >
              ✕ إغلاق
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt="صورة التوصيل بالحجم الكامل"
              className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
