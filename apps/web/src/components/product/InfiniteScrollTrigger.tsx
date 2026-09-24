'use client';

import React, { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

interface InfiniteScrollTriggerProps {
  hasMore: boolean;
  isLoading?: boolean;
  onLoadMore: () => void;
}

/**
 * Replaces a "show more" button: an invisible sentinel that reveals the next page as
 * soon as it scrolls near the viewport, so a listing keeps growing while the shopper
 * scrolls instead of waiting for a click. Renders nothing once there's nothing left.
 */
export const InfiniteScrollTrigger: React.FC<InfiniteScrollTriggerProps> = ({
  hasMore,
  isLoading = false,
  onLoadMore,
}) => {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    // rootMargin loads the next page a bit before the sentinel is actually on screen,
    // so the grid keeps growing ahead of a fast scroll instead of visibly lagging behind it.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: '600px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  if (!hasMore) return null;

  return (
    <div ref={sentinelRef} className="flex justify-center pt-2 pb-6" aria-hidden={!isLoading}>
      {isLoading && <Loader2 className="w-5 h-5 animate-spin text-ragab-brand-700" />}
    </div>
  );
};
