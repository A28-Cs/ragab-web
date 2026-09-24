'use client';

/** Display-only "recently viewed" tracking backed by localStorage. */

const KEY = 'ragab_recently_viewed';
const MAX = 8;

export function getRecentlyViewedIds(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function addRecentlyViewed(productId: string) {
  try {
    const list = [productId, ...getRecentlyViewedIds().filter((id) => id !== productId)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
