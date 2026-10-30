'use client';

import { useEffect, useState } from 'react';
import { Star, ShieldCheck, MessageSquare } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export interface PublicReview {
  id: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  userName: string;
  isVerifiedPurchase: boolean;
  createdAt: string;
}

export interface ProductReviewsData {
  averageRating: number;
  reviewCount: number;
  breakdown: Record<number, number>;
  items: PublicReview[];
}

interface Props {
  productId: string;
  productSlug?: string;
}

export function ProductReviewsSection({ productId, productSlug }: Props) {
  const { isRTL } = useLanguage();
  const [data, setData] = useState<ProductReviewsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    const fetchReviews = async () => {
      try {
        const slugOrId = productSlug || productId;
        const res = await fetch(`/api/v1/products/${slugOrId}/reviews`);
        if (res.ok) {
          const resData = await res.json();
          if (!isCancelled) setData(resData);
        }
      } catch {
        // ignore fetch error
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    fetchReviews();
    return () => {
      isCancelled = true;
    };
  }, [productId, productSlug]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-ragab-ink-200 p-6 shadow-subtle max-w-3xl animate-pulse space-y-4">
        <div className="h-6 w-48 bg-ragab-ink-100 rounded-md" />
        <div className="h-20 bg-ragab-ink-50 rounded-xl" />
      </div>
    );
  }

  const reviews = data?.items || [];
  const averageRating = data?.averageRating || 0;
  const reviewCount = data?.reviewCount || reviews.length;
  const breakdown = data?.breakdown || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

  const totalCalculated = Object.values(breakdown).reduce((a, b) => a + b, 0) || reviewCount || 1;

  return (
    <div className="bg-white rounded-2xl border border-ragab-ink-200 shadow-subtle max-w-3xl overflow-hidden">
      {/* Header */}
      <div className="p-5 md:p-6 border-b border-ragab-ink-100 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-h3 text-ragab-ink-800 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-ragab-brand-600" />
            <span>{isRTL ? 'آراء وتقييمات العملاء' : 'Customer Reviews & Feedback'}</span>
          </h2>
          <p className="text-caption text-ragab-ink-500 mt-0.5">
            {isRTL
              ? 'تقييمات حقيقية من عملاء اشتروا واستلموا هذا المنتج'
              : 'Verified reviews from customers who purchased this item'}
          </p>
        </div>
        {reviewCount > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
            <span className="text-body font-black text-amber-900">{averageRating.toFixed(1)}</span>
            <span className="text-caption font-bold text-amber-700">/ 5</span>
          </div>
        )}
      </div>

      {reviewCount > 0 ? (
        <div className="p-5 md:p-6 space-y-6">
          {/* Rating Breakdown Bar Chart */}
          <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-6 items-center bg-ragab-ink-50/60 p-4 rounded-xl border border-ragab-ink-100">
            <div className="text-center space-y-1">
              <div className="text-4xl font-extrabold text-ragab-ink-900 font-mono">
                {averageRating.toFixed(1)}
              </div>
              <div className="flex justify-center items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-4 h-4 ${
                      star <= Math.round(averageRating)
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-gray-300'
                    }`}
                  />
                ))}
              </div>
              <p className="text-caption text-ragab-ink-500 font-medium">
                {reviewCount} {isRTL ? 'تقييم' : 'reviews'}
              </p>
            </div>

            <div className="space-y-1.5 min-w-0">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = breakdown[star] || 0;
                const pct = Math.round((count / totalCalculated) * 100);
                return (
                  <div key={star} className="flex items-center gap-2 text-caption">
                    <span className="w-12 text-ragab-ink-600 font-bold shrink-0 text-start flex items-center gap-1">
                      <span>{star}</span>
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400 inline" />
                    </span>
                    <div className="flex-1 h-2 bg-ragab-ink-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-end text-ragab-ink-500 font-mono text-xs shrink-0">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* List of Reviews & Comments */}
          <div className="space-y-4 pt-2">
            <h3 className="text-body font-bold text-ragab-ink-800">
              {isRTL ? 'تعليقات وتجارب المشترين' : 'Customer Comments'} ({reviews.length})
            </h3>

            {reviews.map((r) => {
              const formattedDate = new Date(r.createdAt).toLocaleDateString(
                isRTL ? 'ar-EG' : 'en-US',
                { year: 'numeric', month: 'short', day: 'numeric' }
              );

              return (
                <div
                  key={r.id}
                  className="rounded-xl border border-ragab-ink-100 p-4 space-y-2 bg-white hover:border-ragab-ink-200 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-ragab-brand-50 text-ragab-brand-700 font-bold text-xs flex items-center justify-center border border-ragab-brand-200">
                        {r.userName.slice(0, 1)}
                      </div>
                      <span className="font-bold text-body-sm text-ragab-ink-800">{r.userName}</span>
                      {r.isVerifiedPurchase && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <ShieldCheck className="w-3 h-3" />
                          <span>{isRTL ? 'شراء مؤكد' : 'Verified Purchase'}</span>
                        </span>
                      )}
                    </div>
                    <span className="text-caption text-ragab-ink-400 font-medium">
                      {formattedDate}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-3.5 h-3.5 ${
                          star <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'
                        }`}
                      />
                    ))}
                  </div>

                  {r.title && (
                    <p className="font-bold text-body-sm text-ragab-ink-900">{r.title}</p>
                  )}

                  {r.body && (
                    <p className="text-body-sm text-ragab-ink-700 leading-relaxed whitespace-pre-line bg-ragab-ink-50/40 p-3 rounded-lg border border-ragab-ink-100/50">
                      {r.body}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-100">
            <Star className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <p className="text-body font-bold text-ragab-ink-800">
              {isRTL ? 'لا توجد تقييمات مكتوبة بعد لهذا المنتج' : 'No written reviews yet'}
            </p>
            <p className="text-caption text-ragab-ink-500 max-w-md mx-auto">
              {isRTL
                ? 'كن أول من يشارك تجربته بعد الشراء والتوصيل لمساعدة باقي العملاء!'
                : 'Be the first to share your experience after purchasing this product!'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
