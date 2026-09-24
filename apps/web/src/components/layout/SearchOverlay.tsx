'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Search, X, Clock, TrendingUp, ArrowLeft } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { getProducts } from '../../services/productService';
import { getCategories } from '../../services/categoryService';
import { Product, Category } from '../../types';
import { Chip } from '../ui/Chip';

const RECENT_KEY = 'ragab_recent_searches';
const POPULAR_SEARCHES = ['زيت', 'أرز', 'لبن', 'شاي', 'مسحوق غسيل', 'جبنة'];

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveRecentSearch(q: string) {
  try {
    const list = [q, ...readRecent().filter((x) => x !== q)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Full-screen search experience for mobile (and small tablets). */
export const SearchOverlay: React.FC<SearchOverlayProps> = ({ isOpen, onClose }) => {
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setRecent(readRecent());
    getCategories().then(setCategories).catch(() => {});
    // focus after the panel paints
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    let alive = true;
    getProducts({ searchQuery: query })
      .then((res) => alive && setSuggestions(res.slice(0, 6)))
      .catch(() => alive && setSuggestions([]));
    return () => {
      alive = false;
    };
  }, [query]);

  const submit = (q: string) => {
    const clean = q.trim();
    if (!clean) return;
    saveRecentSearch(clean);
    onClose();
    setQuery('');
    router.push(`/search?q=${encodeURIComponent(clean)}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col animate-in fade-in duration-150" role="dialog" aria-modal="true" aria-label={t.common.search}>
      {/* Search bar */}
      <div className="flex items-center gap-2 p-3 border-b border-ragab-ink-100 shrink-0">
        <button
          onClick={onClose}
          aria-label={t.common.close}
          className="touch-target flex items-center justify-center rounded-lg hover:bg-ragab-ink-100 text-ragab-ink-600 focus-ring"
        >
          <ArrowLeft className="w-5 h-5 ltr:rotate-180" />
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(query);
          }}
          className="relative flex-1"
        >
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.common.searchPlaceholder}
            className="w-full h-11 ps-4 pe-11 bg-ragab-ink-50 focus:bg-white border border-ragab-ink-200 focus:border-ragab-brand-500 rounded-lg text-body-sm text-ragab-ink-800 placeholder-ragab-ink-400 focus:outline-none focus:ring-2 focus:ring-ragab-brand-500/40 transition-all font-arabic"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t.common.clearAll}
              className="absolute end-11 top-1/2 -translate-y-1/2 p-1 text-ragab-ink-500 hover:text-ragab-ink-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="submit"
            aria-label={t.common.search}
            className="absolute end-1.5 top-1.5 bottom-1.5 px-3 bg-ragab-brand-500 hover:bg-ragab-brand-600 text-ragab-ink-800 rounded-md flex items-center justify-center transition-colors"
          >
            <Search className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Live suggestions */}
        {suggestions.length > 0 && (
          <div>
            <h3 className="text-label text-ragab-ink-500 font-arabic mb-2">
              {t.products.title}
            </h3>
            <div className="divide-y divide-ragab-ink-100 rounded-xl border border-ragab-ink-100 overflow-hidden">
              {suggestions.map((item) => (
                <Link
                  key={item.id}
                  href={`/product/${item.slug}`}
                  onClick={() => {
                    saveRecentSearch(query.trim());
                    onClose();
                  }}
                  className="flex items-center gap-3 p-3 hover:bg-ragab-cream/40 transition-colors"
                >
                  <span className="w-11 h-11 rounded-lg bg-ragab-ink-50 p-1 shrink-0 relative overflow-hidden">
                    <Image src={item.image} alt="" fill sizes="44px" className="object-contain p-1" />
                  </span>
                  <span className="flex-1 min-w-0 font-arabic">
                    <span className="block text-body-sm font-bold text-ragab-ink-800 truncate">
                      {isRTL ? item.nameAr : item.nameEn || item.nameAr}
                    </span>
                    <span className="block text-caption text-ragab-ink-500">
                      {item.price.toFixed(2)} {t.common.egp} • {isRTL ? item.unitAr : item.unitEn}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent searches */}
        {query.trim().length < 2 && recent.length > 0 && (
          <div>
            <h3 className="flex items-center gap-1.5 text-label text-ragab-ink-500 font-arabic mb-2">
              <Clock className="w-4 h-4" />
              {t.products.recentSearches}
            </h3>
            <div className="flex flex-wrap gap-2">
              {recent.map((q) => (
                <Chip key={q} onClick={() => submit(q)}>
                  {q}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {/* Popular searches */}
        {query.trim().length < 2 && (
          <div>
            <h3 className="flex items-center gap-1.5 text-label text-ragab-ink-500 font-arabic mb-2">
              <TrendingUp className="w-4 h-4" />
              {t.products.popularSearches}
            </h3>
            <div className="flex flex-wrap gap-2">
              {POPULAR_SEARCHES.map((q) => (
                <Chip key={q} onClick={() => submit(q)}>
                  {q}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {/* Category shortcuts */}
        {query.trim().length < 2 && categories.length > 0 && (
          <div>
            <h3 className="text-label text-ragab-ink-500 font-arabic mb-2">
              {t.products.browseCategories}
            </h3>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <Chip
                  key={c.id}
                  onClick={() => {
                    onClose();
                    router.push(`/category/${c.slug}`);
                  }}
                >
                  {isRTL ? c.nameAr : c.nameEn}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
