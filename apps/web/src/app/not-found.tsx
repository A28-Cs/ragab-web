'use client';

import React from 'react';
import Link from 'next/link';
import { Home, SearchX } from 'lucide-react';
import { Button } from '../components/ui/Button';

export default function NotFound() {
  return (
    <div className="py-16 text-center font-arabic max-w-md mx-auto space-y-4">
      <div className="w-16 h-16 rounded-full bg-ragab-cream text-ragab-charcoal flex items-center justify-center mx-auto shadow-subtle">
        <SearchX className="w-8 h-8" />
      </div>
      <h1 className="text-3xl font-extrabold text-ragab-charcoal">404 - الصفحة غير موجودة</h1>
      <p className="text-xs text-gray-500 leading-relaxed">
        عذراً، الرابط الذي تحاول الوصول إليه غير موجود أو تم نقله.
      </p>
      <div className="pt-2">
        <Link href="/">
          <Button variant="primary">
            <Home className="w-4 h-4" />
            <span>العودة للصفحة الرئيسية</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}
