'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { engeznyDb } from '../../lib/firebase';

interface Props {
  orderId: string;
}

/**
 * Reads the delivery photo URL directly from Engezny's Firestore
 * (the Engezny doc ID is always the Ragab order ID).
 */
export function EngeznyDeliveryPhoto({ orderId }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!engeznyDb || !orderId) {
      setLoading(false);
      return;
    }

    getDoc(doc(engeznyDb, 'orders', orderId))
      .then((snap) => {
        if (snap.exists()) {
          setPhotoUrl(snap.data()?.deliveryPhotoUrl ?? null);
        }
      })
      .catch(() => {
        // silently ignore if Engezny is not configured
      })
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return <p className="text-caption text-ragab-ink-400 py-3">جاري التحميل...</p>;
  }

  if (!photoUrl) {
    return (
      <p className="text-caption text-ragab-ink-400 py-3">
        لا توجد صورة توصيل لهذا الطلب
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-caption text-ragab-ink-500">
        صورة التحقق من التوصيل أمام باب العميل
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrl}
        alt="صورة التوصيل"
        className="w-full max-w-sm rounded-xl border border-ragab-ink-100 object-cover"
        style={{ maxHeight: '300px' }}
      />
    </div>
  );
}
