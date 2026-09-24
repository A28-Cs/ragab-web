'use client';

/**
 * Favourites (wishlist). Server-backed for signed-in users via /api/v1/wishlist — the
 * single source of truth shared with the mobile app (§23/§51). Signed-out users keep a
 * local list in localStorage; on login it is merged up once (idempotent) and the server
 * list takes over. The public shape ({ favorites: id[], toggleFavorite, isFavorite })
 * is unchanged so every existing consumer keeps working.
 */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/apiClient';
import type { Product } from '../types';
import { useAuth } from './AuthContext';

interface FavoritesContextType {
  favorites: string[]; // array of product IDs
  toggleFavorite: (productId: string) => void;
  isFavorite: (productId: string) => boolean;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);
const STORAGE_KEY = 'ragab_favorites';

function readLocal(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as string[]) : [];
  } catch {
    return [];
  }
}

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoggedIn, authReady } = useAuth();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  // Guards the one-time merge/load per login so it doesn't re-run on every render.
  const syncedFor = useRef<'anon' | 'user' | null>(null);

  // Initial local hydration (instant paint; also the anonymous store).
  useEffect(() => {
    setFavorites(readLocal());
    setIsHydrated(true);
  }, []);

  // Persist to localStorage only while signed OUT (server owns it when signed in).
  useEffect(() => {
    if (!isHydrated || isLoggedIn) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    } catch {
      // ignore
    }
  }, [favorites, isHydrated, isLoggedIn]);

  // Sync with the server when auth state settles.
  useEffect(() => {
    if (!authReady || !isHydrated) return;

    if (isLoggedIn) {
      if (syncedFor.current === 'user') return;
      syncedFor.current = 'user';
      void (async () => {
        try {
          const local = readLocal();
          const list = local.length
            ? await api.post<Product[]>('/wishlist/merge', { productIds: local })
            : await api.get<Product[]>('/wishlist');
          setFavorites(list.map((p) => p.id));
          // Local copy has been folded into the account; clear it to avoid stale re-merges.
          try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        } catch {
          // On failure, keep whatever is in state; a later toggle/retry reconciles.
        }
      })();
    } else {
      // Signed out (or logged out): fall back to the local list.
      if (syncedFor.current === 'anon') return;
      syncedFor.current = 'anon';
      setFavorites(readLocal());
    }
  }, [authReady, isHydrated, isLoggedIn]);

  const toggleFavorite = useCallback(
    (productId: string) => {
      setFavorites((prev) => {
        const has = prev.includes(productId);
        const next = has ? prev.filter((id) => id !== productId) : [...prev, productId];
        if (isLoggedIn) {
          // Optimistic; reconcile with the server's authoritative list, rollback on error.
          const req = has
            ? api.del<Product[]>(`/wishlist/${productId}`)
            : api.post<Product[]>('/wishlist', { productId });
          void req
            .then((list) => setFavorites(list.map((p) => p.id)))
            .catch(() => setFavorites(prev));
        }
        return next;
      });
    },
    [isLoggedIn],
  );

  const isFavorite = useCallback((productId: string) => favorites.includes(productId), [favorites]);

  return (
    <FavoritesContext.Provider value={{ favorites, toggleFavorite, isFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = () => {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within FavoritesProvider');
  }
  return context;
};
